/* ==========================================================================
   Fetch, join, and count
   --------------------------------------------------------------------------
   Turns three L&I files into the numbers the site publishes. The care here is
   almost entirely about what the data does NOT support — see build/RESEARCH.md
   before changing any threshold or wording.
   ========================================================================== */

'use strict';

const { query, pull, verifyCount } = require('./socrata');
const { CATEGORIES, KING_COUNTY_CITIES } = require('../../data/categories.js');

/* A city page is generated only above this many contractors. Below it the page
   is a template with a name swapped in, which is both useless to a reader and
   the pattern search engines treat as scaled content. */
const CITY_PAGE_FLOOR = 8;

/* Listings per page. General contractors alone run to about 11,700 in this
   county; rendered on one page that is roughly 32 MB of HTML, which no phone
   is going to enjoy. Paginating keeps every page a sensible weight and gives
   each chunk a real URL of its own. */
const PER_PAGE = 60;

const todayISO = () => new Date().toISOString().slice(0, 10);
const sq = (s) => String(s).replace(/'/g, "''");
const inList = (arr) => '(' + arr.map((v) => "'" + sq(v) + "'").join(',') + ')';

function date(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/* `bondexpirationdate` is a TEXT column and is usually the string
   "Until Canceled". Anything unparseable means "no expiry", not "expired". */
function isCurrent(effective, cancelled, expires, now) {
  const e = date(effective), c = date(cancelled), x = date(expires);
  if (e && e > now) return false;
  if (c && c <= now) return false;
  if (x && x <= now) return false;
  return true;
}

function kingCountyWhere(extra) {
  const clauses = [
    "contractorlicensestatus='ACTIVE'",
    "licenseexpirationdate > '" + todayISO() + "T00:00:00'",
    'upper(city) in' + inList(KING_COUNTY_CITIES)
  ];
  if (extra) clauses.push(extra);
  return clauses.join(' AND ');
}

function categoryWhere(cat) {
  const c = [];
  if (cat.licenseTypes && cat.licenseTypes.length) {
    c.push('contractorlicensetypecodedesc in' + inList(cat.licenseTypes));
  }
  if (cat.specialtyCodes && cat.specialtyCodes.length) {
    c.push('specialtycode1 in' + inList(cat.specialtyCodes));
  }
  return c.join(' AND ');
}

/* ------------------------------------------------------------------ fetch */

async function fetchAll(log = () => {}) {
  /* Offline fixture, so the render path can be tested without the network and
     without hammering a public API. The fixture carries the same shape as the
     live files, including the awkward parts: "Until Canceled" in a text
     expiry column, licences with no bond row, and an impaired bond. */
  if (process.env.KCC_FIXTURE) {
    const fx = JSON.parse(require('fs').readFileSync(process.env.KCC_FIXTURE, 'utf8'));
    log('Using fixture ' + process.env.KCC_FIXTURE + ' (' + fx.actives.length + ' registrations)');
    return {
      now: fx.now ? new Date(fx.now) : new Date(),
      actives: fx.actives,
      bonds: fx.bonds,
      insurance: fx.insurance,
      statusMix: fx.statusMix
    };
  }

  const now = new Date();

  log('Fetching King County active registrations…');
  const actives = await pull('general', {
    select: [
      'businessname', 'contractorlicensenumber', 'ubi', 'city', 'state', 'zip',
      'address1', 'phonenumber', 'contractorlicensetypecode',
      'contractorlicensetypecodedesc', 'specialtycode1', 'specialtycode1desc',
      'businesstypecodedesc', 'licenseeffectivedate', 'licenseexpirationdate',
      'contractorlicensestatus', 'primaryprincipalname'
    ].join(','),
    where: kingCountyWhere()
  });
  log('  ' + actives.length.toLocaleString() + ' active King County registrations');

  log('Fetching bond file…');
  const bonds = await pull('bond', {
    select: [
      'contractorlicensenumber', 'ubi', 'bondamt', 'bondfirmname',
      'bondeffectivedate', 'bondcanceldate', 'bondexpirationdate',
      'bondimpaired', 'bondimpaireddate', 'contractorlicensetypecode'
    ].join(',')
  });
  await verifyCount('bond', bonds, 'bond file');
  log('  ' + bonds.length.toLocaleString() + ' bond rows (count verified)');

  log('Fetching insurance file…');
  const insurance = await pull('insurance', {
    select: [
      'contractorlicensenumber', 'ubi', 'insuranceamt', 'insurancecompany',
      'effectivedate', 'expirationdate', 'canceldate', 'contractorlicensetypecode'
    ].join(',')
  });
  await verifyCount('insurance', insurance, 'insurance file');
  log('  ' + insurance.length.toLocaleString() + ' insurance rows (count verified)');

  log('Fetching county status mix…');
  const statusMix = await query('general', {
    $select: 'contractorlicensestatus,count(*) as c',
    $where: 'upper(city) in' + inList(KING_COUNTY_CITIES),
    $group: 'contractorlicensestatus',
    $order: 'c desc',
    $limit: 40
  });

  return { now, actives, bonds, insurance, statusMix };
}

/* ------------------------------------------------------------------- join */

function index(raw) {
  const { now, actives, bonds, insurance } = raw;

  const bondCurrent = new Map();   // licence -> richest current bond
  const bondAny     = new Set();   // licence -> appears in the file at all
  const impaired    = new Map();   // licence -> impaired bond row

  for (const b of bonds) {
    const k = b.contractorlicensenumber;
    if (!k) continue;
    bondAny.add(k);
    if (b.bondimpaired === 'Y') impaired.set(k, b);
    if (isCurrent(b.bondeffectivedate, b.bondcanceldate, b.bondexpirationdate, now)) {
      const prev = bondCurrent.get(k);
      if (!prev || Number(b.bondamt) > Number(prev.bondamt)) bondCurrent.set(k, b);
    }
  }

  const insCurrent = new Map();
  const insAny     = new Set();
  for (const i of insurance) {
    const k = i.contractorlicensenumber;
    if (!k) continue;
    insAny.add(k);
    if (isCurrent(i.effectivedate, i.canceldate, i.expirationdate, now)) {
      const prev = insCurrent.get(k);
      if (!prev || Number(i.insuranceamt) > Number(prev.insuranceamt)) insCurrent.set(k, i);
    }
  }

  const records = actives.map((r) => {
    const k = r.contractorlicensenumber;
    return {
      ...r,
      city: String(r.city || '').toUpperCase(),
      bond: bondCurrent.get(k) || null,
      insurance: insCurrent.get(k) || null,
      bondEverFiled: bondAny.has(k),
      insuranceEverFiled: insAny.has(k),
      impairedBond: impaired.get(k) || null
    };
  });

  return { records, impairedCount: impaired.size };
}

/* ------------------------------------------------------------- categorise */

function assign(records) {
  const byTrade = new Map();
  for (const cat of CATEGORIES) {
    const types = new Set(cat.licenseTypes || []);
    const codes = new Set(cat.specialtyCodes || []);
    const hit = records.filter((r) =>
      (!types.size || types.has(r.contractorlicensetypecodedesc)) &&
      (!codes.size || codes.has(r.specialtycode1))
    );
    byTrade.set(cat.id, hit);
  }
  return byTrade;
}

function cityBreakdown(list) {
  const m = new Map();
  for (const r of list) m.set(r.city, (m.get(r.city) || 0) + 1);
  return [...m.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/* ------------------------------------------------------------------ stats */

function statistics(raw, indexed, byTrade) {
  const { records } = indexed;
  const n = records.length;

  /* Insurance coverage is reported for construction and plumbing only. The
     insurance file holds 290 electrical rows statewide against 1,107 active
     electrical registrations in King County alone, so an "electricians are
     uninsured" figure would describe the file, not the trade. */
  const insScope = records.filter((r) => r.contractorlicensetypecode === 'CC' || r.contractorlicensetypecode === 'PC');
  const insured = insScope.filter((r) => r.insurance).length;

  const bonded = records.filter((r) => r.bond).length;
  const noBondRow = records.filter((r) => !r.bondEverFiled).length;

  const bondAmounts = records.filter((r) => r.bond).map((r) => Number(r.bond.bondamt)).sort((a, b) => a - b);
  const pct = (p) => bondAmounts.length ? bondAmounts[Math.floor(bondAmounts.length * p)] : 0;

  const aboveMinimum = records.filter((r) => {
    if (!r.bond) return false;
    const floor = r.specialtycode1 === '01' ? 30000 : 15000;
    return Number(r.bond.bondamt) > floor;
  }).length;

  const byYear = new Map();
  for (const r of records) {
    const y = String(r.licenseeffectivedate || '').slice(0, 4);
    if (y >= '2000') byYear.set(y, (byYear.get(y) || 0) + 1);
  }

  const status = {};
  for (const s of raw.statusMix) status[s.contractorlicensestatus] = Number(s.c);

  const trades = [...byTrade.entries()]
    .map(([id, list]) => {
      const cat = CATEGORIES.find((c) => c.id === id);
      const scoped = list.filter((r) => r.contractorlicensetypecode === 'CC' || r.contractorlicensetypecode === 'PC');
      return {
        id,
        name: cat.name,
        count: list.length,
        bonded: list.filter((r) => r.bond).length,
        insured: scoped.filter((r) => r.insurance).length,
        insuranceScope: scoped.length,
        medianBond: (() => {
          const a = list.filter((r) => r.bond).map((r) => Number(r.bond.bondamt)).sort((x, y) => x - y);
          return a.length ? a[Math.floor(a.length / 2)] : 0;
        })()
      };
    })
    .sort((a, b) => b.count - a.count);

  const cities = cityBreakdown(records);

  return {
    generatedAt: raw.now.toISOString(),
    active: n,
    status,
    totalOnFile: Object.values(status).reduce((a, b) => a + b, 0),
    bonded,
    bondedPct: n ? bonded / n * 100 : 0,
    noBondRow,
    noBondRowPct: n ? noBondRow / n * 100 : 0,
    insured,
    insuranceScope: insScope.length,
    insuredPct: insScope.length ? insured / insScope.length * 100 : 0,
    impairedBonds: indexed.impairedCount,
    impairedInCounty: records.filter((r) => r.impairedBond).length,
    bondMedian: pct(0.5),
    bondP25: pct(0.25),
    bondP75: pct(0.75),
    bondMax: bondAmounts[bondAmounts.length - 1] || 0,
    aboveMinimum,
    aboveMinimumPct: bonded ? aboveMinimum / bonded * 100 : 0,
    byYear: [...byYear.entries()].sort(),
    trades,
    cities
  };
}

/* --------------------------------------------------------------- page set */

/* Alphabetical inside a page, so the order is stable between weekly builds
   and a contractor does not move around for no reason. */
const byName = (a, b) => String(a.businessname).localeCompare(String(b.businessname));

function paginate(records) {
  const sorted = records.slice().sort(byName);
  const total = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const out = [];
  for (let i = 0; i < total; i++) {
    out.push({
      page: i + 1,
      pages: total,
      records: sorted.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
      totalRecords: sorted.length
    });
  }
  return out;
}

function pagePlan(byTrade) {
  const pages = [];
  for (const cat of CATEGORIES) {
    const list = byTrade.get(cat.id) || [];
    if (!list.length) continue;

    for (const chunk of paginate(list)) {
      pages.push({ kind: 'trade', trade: cat, ...chunk, all: list });
    }

    for (const { city, count } of cityBreakdown(list)) {
      if (count < CITY_PAGE_FLOOR) continue;
      const inCity = list.filter((r) => r.city === city);
      for (const chunk of paginate(inCity)) {
        pages.push({ kind: 'city', trade: cat, city, ...chunk });
      }
    }
  }
  return pages;
}

module.exports = {
  CITY_PAGE_FLOOR, PER_PAGE, paginate, CATEGORIES, KING_COUNTY_CITIES,
  fetchAll, index, assign, cityBreakdown, statistics, pagePlan,
  isCurrent, date, todayISO
};
