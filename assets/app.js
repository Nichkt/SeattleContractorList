/* ==========================================================================
   King County Contractor Directory
   --------------------------------------------------------------------------
   Queries the Washington State L&I contractor registry live, in the browser,
   from three public Socrata datasets:

     m8qx-ubtq  General   - identity, license type, specialty, status, address
     bzff-4fmt  Bond      - surety bond firm, amount, effective/expiration
     ciwg-agsx  Insurance - carrier, policy number, amount, expiration

   Socrata serves these with permissive CORS for public read-only access, so
   a static GitHub Pages site can query them directly with no backend and no
   API key. Every result is therefore current as of page load rather than as
   of whenever a data file was last committed.

   A contractor is shown as fully "Licensed, Bonded & Insured" only when all
   three datasets independently confirm it, with unexpired dates.
   ========================================================================== */

'use strict';

const API = {
  general: 'https://data.wa.gov/resource/m8qx-ubtq.json',
  bond: 'https://data.wa.gov/resource/bzff-4fmt.json',
  insurance: 'https://data.wa.gov/resource/ciwg-agsx.json'
};

const PAGE_SIZE = 24;

/* Ratings are computed once, across every reviewed business, because award
   tiers are population-relative — you cannot know whether a business is in
   the top 1% by looking at one page of results. */
const ratings = { byUbi: {}, entries: [], calibration: null };

function buildRatings() {
  const idx = reviewsByUbi();
  const pool = allReviews();
  const cal = computeCalibration(pool);
  const entries = Object.keys(idx).map((ubi) => ({
    ubi: ubi,
    rating: scoreBusiness(idx[ubi], { calibration: cal })
  }));
  assignAwards(entries);
  ratings.calibration = cal;
  ratings.entries = entries;
  ratings.byUbi = {};
  entries.forEach((e) => { if (e.rating) ratings.byUbi[e.ubi] = e.rating; });
}

const state = {
  category: null,
  city: '',
  search: '',
  sort: 'name',
  requireBonded: true,
  requireInsured: true,
  certsOnly: false,
  page: 0,
  total: null,
  fetched: 0,
  results: [],
  loading: false,
  reqId: 0
};

/* ----------------------------------------------------------------- utils */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** Escape a string for safe interpolation into a SoQL string literal. */
function soql(str) {
  return String(str).replace(/'/g, "''");
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Socrata floating timestamps have no zone; compare as plain dates. */
function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^until canceled$/i.test(s)) return Infinity; // bonds can be open-ended
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // e.g. "03/03/2026"
  if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function isCurrent(value) {
  const t = parseDate(value);
  if (t === null) return false;
  if (t === Infinity) return true;
  return t >= Date.now() - 86400000; // one day of grace for tz skew
}

function fmtDate(value) {
  const t = parseDate(value);
  if (t === Infinity) return 'Until canceled';
  if (t === null) return '—';
  return new Date(t).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  });
}

function fmtMoney(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return value || '';
}

/* Keep in sync with build/lib/format.js. The pre-rendered pages use that
   implementation, so any divergence shows up as business names changing when
   the live lookup replaces the static markup. test/smoke.js asserts they agree. */
const TC_SMALL = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an']);
const TC_KEEP = new Set([
  'LLC', 'PLLC', 'LLP', 'LP', 'PC', 'PS', 'USA', 'US', 'HVAC', 'PNW',
  'NW', 'NE', 'SW', 'SE', 'WA', 'DBA', 'II', 'III', 'IV', 'V',
  'CNC', 'PVC', 'HDPE', 'LED', 'AC', 'TV', 'RV', 'ADU', 'GC'
]);

function titleCase(str) {
  if (!str) return '';
  return String(str).toLowerCase().split(/\s+/).map((w, i) => {
    const up = w.toUpperCase().replace(/[^A-Z]/g, '');
    if (TC_KEEP.has(up)) return w.toUpperCase();
    if (i > 0 && TC_SMALL.has(w)) return w;
    return w.replace(/^[a-z]/, (c) => c.toUpperCase())
            .replace(/([-/])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
            .replace(/'([a-z]{2,})/g, (m, rest) => "'" + rest[0].toUpperCase() + rest.slice(1));
  }).join(' ');
}

/* ------------------------------------------------------------ API layer */

async function socrata(url, params) {
  const qs = Object.keys(params)
    .filter((k) => params[k] !== null && params[k] !== undefined && params[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const res = await fetch(url + '?' + qs, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    throw new Error('L&I data request failed (HTTP ' + res.status + ')');
  }
  return res.json();
}

/** Compose the SoQL WHERE clause shared by the count and page queries. */
function buildWhere() {
  const clauses = ["contractorlicensestatus='ACTIVE'"];

  // Only registrations that have not lapsed.
  clauses.push("licenseexpirationdate > '" + todayISO() + "T00:00:00'");

  // Geography: King County mailing city.
  const cities = state.city ? [state.city] : KING_COUNTY_CITIES;
  clauses.push(
    'upper(city) in(' + cities.map((c) => "'" + soql(c) + "'").join(',') + ')'
  );

  const cat = state.category;
  if (cat) {
    if (cat.licenseTypes && cat.licenseTypes.length) {
      clauses.push(
        'contractorlicensetypecodedesc in(' +
          cat.licenseTypes.map((t) => "'" + soql(t) + "'").join(',') + ')'
      );
    }
    // Filter on the short specialty CODE rather than the description. The
    // descriptions in the source data contain commas and stray whitespace
    // (e.g. a trailing space on the HVAC value), so matching them exactly
    // is both fragile and needlessly verbose. See data/categories.js.
    if (cat.specialtyCodes && cat.specialtyCodes.length) {
      clauses.push(
        'specialtycode1 in(' +
          cat.specialtyCodes.map((s) => "'" + soql(s) + "'").join(',') + ')'
      );
    }
  }

  if (state.search.trim()) {
    const term = soql(state.search.trim().toUpperCase());
    clauses.push("upper(businessname) like '%" + term + "%'");
  }

  return clauses.join(' AND ');
}

async function fetchCount(where) {
  const rows = await socrata(API.general, { $select: 'count(*)', $where: where });
  return parseInt(rows[0] && rows[0].count, 10) || 0;
}

async function fetchPage(where, page) {
  return socrata(API.general, {
    $select: [
      'businessname', 'contractorlicensenumber', 'contractorlicensetypecodedesc',
      'specialtycode1desc', 'address1', 'city', 'state', 'zip', 'phonenumber',
      'licenseeffectivedate', 'licenseexpirationdate', 'ubi',
      'primaryprincipalname', 'businesstypecodedesc'
    ].join(','),
    $where: where,
    $order: 'businessname ASC',
    $limit: PAGE_SIZE,
    $offset: page * PAGE_SIZE
  });
}

/**
 * Fetch bond and insurance rows for a batch of license numbers and reduce
 * each contractor's history down to its single best *current* record.
 */
async function fetchCoverage(licenses) {
  if (!licenses.length) return { bond: {}, ins: {} };
  const inList = licenses.map((l) => "'" + soql(l) + "'").join(',');
  const where = 'contractorlicensenumber in(' + inList + ')';

  const [bondRows, insRows] = await Promise.all([
    socrata(API.bond, {
      $select: 'contractorlicensenumber,bondfirmname,bondaccountid,bondamt,bondeffectivedate,bondexpirationdate',
      $where: where,
      $limit: 2000
    }).catch(() => []),
    socrata(API.insurance, {
      $select: 'contractorlicensenumber,insurancecompany,insurancepolicyno,insuranceamt,effectivedate,expirationdate,insuranceagencyname',
      $where: where,
      $limit: 2000
    }).catch(() => [])
  ]);

  const bond = {};
  bondRows.forEach((r) => {
    const k = r.contractorlicensenumber;
    if (!k) return;
    const current = isCurrent(r.bondexpirationdate);
    const prev = bond[k];
    // Prefer a current bond; among current ones prefer the largest amount.
    if (!prev ||
        (current && !prev.__current) ||
        (current === prev.__current &&
          parseFloat(r.bondamt || 0) > parseFloat(prev.bondamt || 0))) {
      r.__current = current;
      bond[k] = r;
    }
  });

  const ins = {};
  insRows.forEach((r) => {
    const k = r.contractorlicensenumber;
    if (!k) return;
    const current = isCurrent(r.expirationdate);
    const prev = ins[k];
    if (!prev ||
        (current && !prev.__current) ||
        (current === prev.__current &&
          (parseDate(r.expirationdate) || 0) > (parseDate(prev.expirationdate) || 0))) {
      r.__current = current;
      ins[k] = r;
    }
  });

  return { bond: bond, ins: ins };
}

/* --------------------------------------------------------- record model */

function certsFor(record) {
  const byUbi = CERTS_BY_UBI[String(record.ubi || '').trim()];
  const byLic = CERTS_BY_LICENSE[String(record.contractorlicensenumber || '').trim().toUpperCase()];
  return byUbi || byLic || null;
}

function decorate(record, coverage) {
  const lic = record.contractorlicensenumber;
  const b = coverage.bond[lic];
  const i = coverage.ins[lic];
  const overlay = certsFor(record);

  return Object.assign({}, record, {
    bond: b || null,
    insurance: i || null,
    bonded: !!(b && b.__current),
    insured: !!(i && i.__current),
    licensed: true, // the query already constrained to ACTIVE + unexpired
    overlay: overlay,
    rating: ratings.byUbi[String(record.ubi || '').trim()] || null,
    certCount: overlay && overlay.certs ? overlay.certs.length : 0,
    reviewTotal: overlay && overlay.reviews
      ? (overlay.reviews.google ? overlay.reviews.google.count || 0 : 0) +
        (overlay.reviews.yelp ? overlay.reviews.yelp.count || 0 : 0)
      : 0
  });
}

function sortRecords(records) {
  const s = state.sort;
  const arr = records.slice();
  if (s === 'name') {
    arr.sort((a, b) => a.businessname.localeCompare(b.businessname));
  } else if (s === 'score') {
    // Unrated businesses sort last rather than being treated as zero — an
    // absent score is missing data, not a bad review.
    arr.sort((a, b) => {
      const as = a.rating ? a.rating.score : -1;
      const bs = b.rating ? b.rating.score : -1;
      return bs - as || a.businessname.localeCompare(b.businessname);
    });
  } else if (s === 'reviews') {
    arr.sort((a, b) => b.reviewTotal - a.reviewTotal ||
      b.certCount - a.certCount || a.businessname.localeCompare(b.businessname));
  } else if (s === 'certs') {
    arr.sort((a, b) => b.certCount - a.certCount ||
      b.reviewTotal - a.reviewTotal || a.businessname.localeCompare(b.businessname));
  } else if (s === 'tenure') {
    arr.sort((a, b) => (parseDate(a.licenseeffectivedate) || Infinity) -
      (parseDate(b.licenseeffectivedate) || Infinity));
  } else if (s === 'city') {
    arr.sort((a, b) => titleCase(a.city).localeCompare(titleCase(b.city)) ||
      a.businessname.localeCompare(b.businessname));
  }
  return arr;
}

function applyClientFilters(records) {
  return records.filter((r) => {
    if (state.requireBonded && !r.bonded) return false;
    if (state.requireInsured && !r.insured) return false;
    if (state.certsOnly && r.certCount === 0) return false;
    return true;
  });
}

/* ------------------------------------------------------------ rendering */

function lniVerifyUrl(record) {
  return 'https://secure.lni.wa.gov/verify/Detail.aspx?UBI=' +
    encodeURIComponent(record.ubi || '') + '&LIC=' +
    encodeURIComponent(record.contractorlicensenumber || '');
}

function statusPill(ok, label, detail) {
  return `<span class="pill ${ok ? 'pill--yes' : 'pill--no'}" title="${esc(detail || '')}">
    <svg viewBox="0 0 20 20" aria-hidden="true">${
      ok ? '<path d="M4 10l4 4 8-8"/>' : '<path d="M5 5l10 10M15 5L5 15"/>'
    }</svg>${esc(label)}</span>`;
}

const TIER_LABEL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

function scoreBar(value) {
  // Map the 1-5 scale onto a 0-100% bar.
  const pct = Math.max(0, Math.min(100, ((value - 1) / 4) * 100));
  return pct.toFixed(1);
}

function reviewHref(record) {
  return 'review.html?ubi=' + encodeURIComponent(record.ubi || '') +
    '&name=' + encodeURIComponent(titleCase(record.businessname));
}

function ratingHTML(record) {
  const r = record.rating;
  if (!r) {
    // "Not yet rated" only tells you something when SOME contractors are
    // rated. With an empty review set it is the same non-fact on every card
    // in the county, so it is suppressed entirely and the invitation to
    // review lives quietly in the contact row instead.
    if (!ratings.entries.length) return '';
    return `<div class="rating rating--none">
      <span class="rating__na">Not yet rated</span>
      <a class="rating__add" href="${esc(reviewHref(record))}">Write the first review →</a>
    </div>`;
  }

  const axes = SCORING.AXES.map((axis) => {
    const v = r.axes[axis.key];
    if (v === null || v === undefined) return '';
    return `<div class="axis" title="${esc(axis.help)}">
      <span class="axis__label">${esc(axis.label)}</span>
      <span class="axis__track"><span class="axis__fill" style="width:${scoreBar(v)}%"></span></span>
      <span class="axis__val">${v.toFixed(2)}</span>
    </div>`;
  }).join('');

  return `<div class="rating">
    <div class="rating__head">
      <span class="rating__score">${r.score.toFixed(2)}</span>
      <span class="rating__of">/ 5.00</span>
      ${r.tier ? `<span class="award award--${esc(r.tier)}">${esc(TIER_LABEL[r.tier])}</span>` : ''}
      <span class="rating__count">${r.count} review${r.count === 1 ? '' : 's'}</span>
      ${r.provisional ? '<span class="rating__prov" title="Too few reviews to trust yet. The score sits near the middle until more come in.">thin</span>' : ''}
    </div>
    <div class="rating__bar"><span style="width:${scoreBar(r.score)}%"></span></div>
    <details class="rating__more">
      <summary>Score breakdown</summary>
      <div class="axes">${axes}</div>
      <p class="muted small">
        Raw average ${r.rawMean.toFixed(2)} from ${r.count} review${r.count === 1 ? '' : 's'}.
        The score above starts near the county average and moves as a business earns it.
        <a href="about.html#scoring">How the score works</a>
      </p>
      <a class="btn btn--ghost" href="${esc(reviewHref(record))}">Write a review</a>
    </details>
  </div>`;
}

function certBadges(record) {
  if (!record.overlay || !record.overlay.certs || !record.overlay.certs.length) {
    return '';
  }
  return '<div class="certs">' + record.overlay.certs.map((c) => {
    const prog = CERT_PROGRAMS[c.key];
    if (!prog) return '';
    const verified = c.verified && c.source;
    return `<a class="cert cert--${esc(prog.tier)}${verified ? '' : ' cert--unverified'}"
      href="${esc(verified ? c.source : prog.verifyUrl)}" target="_blank" rel="noopener"
      title="${esc(prog.label + ' — ' + prog.body + (verified ? '. Verified ' + c.verified : '. UNVERIFIED — confirm before relying on this.'))}">
      ${esc(prog.short)}${verified ? '' : ' <span class="cert__q">?</span>'}</a>`;
  }).join('') + '</div>';
}

/**
 * Outbound links for a contractor: their own website, Google, and Yelp.
 *
 * IMPORTANT: none of this comes from the state. L&I's published file has 19
 * fields and a website is not among them, and neither Google Place IDs nor
 * Yelp business IDs are in there either. Scraping any of those platforms to
 * obtain one would breach their terms. So every link here is one of two things:
 *
 *   VERIFIED  a URL somebody confirmed by hand and recorded in the overlay,
 *             rendered as a direct link.
 *   LOOKUP    a search scoped to the business name and city, which lands on
 *             the right result in one click but is not a guaranteed match.
 *
 * The label says which. "Website" and "Reviews" mean confirmed; "Find" and
 * "Look them up" mean we are handing you a search and you should check the
 * result is the right company before trusting it. Getting that distinction
 * wrong would attach one contractor's reputation to another's name.
 *
 * Only counts and ratings are ever rendered from the overlay, never review
 * text. Republishing Google or Yelp review content violates their terms;
 * linking to them does not.
 */
function externalLinks(record) {
  const name = titleCase(record.businessname);
  const city = titleCase(record.city || '');
  const o = record.overlay || {};
  const rv = o.reviews || null;
  const scope = encodeURIComponent(name + ' ' + city + ' WA');

  const site = o.website && o.website.url ? o.website : null;
  const siteUrl = site ? site.url
    : 'https://www.google.com/search?q=' + scope;

  const googleUrl = (rv && rv.google && rv.google.url)
    ? rv.google.url
    : 'https://www.google.com/maps/search/?api=1&query=' + scope;

  const yelpUrl = (rv && rv.yelp && rv.yelp.url)
    ? rv.yelp.url
    : 'https://www.yelp.com/search?find_desc=' + encodeURIComponent(name) +
      '&find_loc=' + encodeURIComponent(city + ', WA');

  function stat(src) {
    if (!src || !src.count) return '';
    return '<span class="extlink__stat">' +
      (src.rating ? esc(src.rating) + '\u2605 \u00b7 ' : '') +
      esc(src.count) + '</span>';
  }

  // Strip scheme and any www. so the chip shows a readable domain.
  function domainOf(url) {
    return String(url).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }

  const reviewsVerified = !!(rv && ((rv.google && rv.google.url) || (rv.yelp && rv.yelp.url)));

  const siteChip = site
    ? `<a class="extlink extlink--site" href="${esc(siteUrl)}" target="_blank" rel="noopener noreferrer"
         title="${esc('Confirmed website' + (site.checked ? ', checked ' + site.checked : '') + '.')}">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>
         ${esc(domainOf(siteUrl))}</a>`
    : `<a class="extlink" href="${esc(siteUrl)}" target="_blank" rel="noopener noreferrer"
         title="A web search for this business. We have not confirmed a website for them.">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4"/></svg>
         Find site</a>`;

  return `<div class="extlinks">
    <span class="extlinks__label" title="${esc(site || reviewsVerified
      ? 'Confirmed links appear as the site or platform name. Anything labelled Find or Look up is a search.'
      : 'These are searches by name and city, not confirmed matches. Check the result is the right company.')}">${site || reviewsVerified ? 'Links' : 'Look them up'}</span>
    ${siteChip}
    <a class="extlink" href="${esc(googleUrl)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></svg>
      Google${stat(rv && rv.google)}</a>
    <a class="extlink" href="${esc(yelpUrl)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M12 13l5 4M12 13l-5 4M12 13l7-2M12 13l-7-2"/></svg>
      Yelp${stat(rv && rv.yelp)}</a>
  </div>`;
}

function cardHTML(record) {
  const b = record.bond;
  const i = record.insurance;
  const addr = [titleCase(record.address1), titleCase(record.city), 'WA', record.zip]
    .filter(Boolean).join(', ');

  return `
  <article class="card">
    <header class="card__head">
      <h3 class="card__name">${esc(titleCase(record.businessname))}</h3>
      <div class="card__status">
        ${statusPill(record.licensed, 'Licensed',
          'Active registration through ' + fmtDate(record.licenseexpirationdate))}
        ${statusPill(record.bonded, 'Bonded',
          b ? b.bondfirmname + ' — ' + fmtMoney(b.bondamt) : 'No current bond on file')}
        ${statusPill(record.insured, 'Insured',
          i ? i.insurancecompany + ' — ' + fmtMoney(i.insuranceamt) : 'No current policy on file')}
      </div>
    </header>

    ${ratingHTML(record)}
    ${certBadges(record)}
    ${externalLinks(record)}

    <dl class="card__meta">
      <div><dt>Specialty</dt><dd>${esc(titleCase(record.specialtycode1desc || 'General'))}</dd></div>
      <div><dt>License #</dt><dd class="mono">${esc(record.contractorlicensenumber)}</dd></div>
      <div><dt>Registered since</dt><dd>${fmtDate(record.licenseeffectivedate)}</dd></div>
      <div><dt>Business type</dt><dd>${esc(record.businesstypecodedesc || '—')}</dd></div>
    </dl>

    <div class="card__contact">
      ${record.phonenumber
        ? `<a class="btn btn--ghost" href="tel:${esc(String(record.phonenumber).replace(/\D/g, ''))}">
             ${esc(fmtPhone(record.phonenumber))}</a>` : ''}
      <span class="card__addr">${esc(addr)}</span>
      <a class="card__review" href="${esc(reviewHref(record))}">Review</a>
    </div>

    <details class="card__more">
      <summary>Bond &amp; insurance</summary>
      <div class="detail-grid">
        <div>
          <h4>The bond</h4>
          ${b ? `<p>${esc(b.bondfirmname || '—')}<br>
                 Amount ${fmtMoney(b.bondamt)}<br>
                 Effective ${fmtDate(b.bondeffectivedate)}<br>
                 Expires ${fmtDate(b.bondexpirationdate)}</p>`
              : '<p class="muted">The state returned no bond record.</p>'}
        </div>
        <div>
          <h4>The insurance</h4>
          ${i ? `<p>${esc(i.insurancecompany || '—')}<br>
                 Coverage ${fmtMoney(i.insuranceamt)}<br>
                 Policy <span class="mono">${esc(i.insurancepolicyno || '—')}</span><br>
                 Expires ${fmtDate(i.expirationdate)}</p>`
              : '<p class="muted">The state returned no insurance record.</p>'}
        </div>
      </div>
      ${record.primaryprincipalname
        ? `<p class="muted">Principal: ${esc(titleCase(record.primaryprincipalname))}</p>` : ''}
      <a class="btn btn--primary" href="${esc(lniVerifyUrl(record))}"
         target="_blank" rel="noopener">Check it on L&amp;I →</a>
    </details>
  </article>`;
}

/* ------------------------------------------------------------ UI wiring */

/* --------------------------------------------------------------- URL state

   Every filter lives in the query string so a search can be bookmarked,
   shared, or linked to. It also gives search engines something to crawl:
   before this, every view of the site was the same URL, so a page listing
   Kent roofers was indistinguishable from the front page.

   history calls are wrapped because they throw a SecurityError on file://
   origins, which is how the headless tests load the site.
   -------------------------------------------------------------------------- */

const URL_KEYS = ['trade', 'city', 'q', 'sort', 'page', 'bonded', 'insured', 'certs'];

function readUrl() {
  const p = new URLSearchParams(location.search);

  const trade = p.get('trade');
  if (trade) state.category = CATEGORIES.find((c) => c.id === trade) || null;

  const city = (p.get('city') || '').toUpperCase();
  if (city && KING_COUNTY_CITIES.indexOf(city) !== -1) state.city = city;

  if (p.get('q')) state.search = p.get('q');
  if (p.get('sort')) state.sort = p.get('sort');

  const page = parseInt(p.get('page'), 10);
  if (page > 1) state.page = page - 1;

  // Absent means default (on). Only an explicit "0" turns a filter off.
  if (p.get('bonded') === '0') state.requireBonded = false;
  if (p.get('insured') === '0') state.requireInsured = false;
  if (p.get('certs') === '1') state.certsOnly = true;

  return p.toString().length > 0;
}

function currentUrl() {
  const p = new URLSearchParams();
  if (state.category) p.set('trade', state.category.id);
  if (state.city) p.set('city', state.city);
  if (state.search.trim()) p.set('q', state.search.trim());
  if (state.sort !== 'name') p.set('sort', state.sort);
  if (state.page > 0) p.set('page', String(state.page + 1));
  if (!state.requireBonded) p.set('bonded', '0');
  if (!state.requireInsured) p.set('insured', '0');
  if (state.certsOnly) p.set('certs', '1');
  const qs = p.toString();
  return location.pathname + (qs ? '?' + qs : '');
}

function syncUrl(push) {
  const url = currentUrl();
  try {
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  } catch (e) { /* file:// origin, or a browser that refuses. Not fatal. */ }
  updateSeo();
}

/** Title, description and canonical follow the current view. */
function updateSeo() {
  const trade = state.category ? state.category.name : 'Contractors';
  const where = state.city ? titleCase(state.city) : 'King County';
  const title = state.category
    ? `${trade} in ${where} — Licensed, Bonded & Insured`
    : `King County Contractor Directory — Licensed, Bonded & Insured`;
  document.title = title;

  const desc = state.category
    ? `Every actively registered ${trade.toLowerCase()} contractor in ${where}, Washington, ` +
      `checked against the state registry for an active licence, a current bond and ` +
      `current liability insurance. ${state.category.blurb}`
    : `Every actively registered contractor in King County, Washington, checked live ` +
      `against the Washington State L&I registry for licence, bond and insurance.`;
  let m = document.querySelector('meta[name="description"]');
  if (m) m.setAttribute('content', desc);

  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  try {
    link.setAttribute('href', new URL(currentUrl(), location.href).href.split('#')[0]);
  } catch (e) {}

  const h1 = $('#heroTitle');
  if (h1 && state.category) {
    h1.textContent = trade + ' in ' + where;
  } else if (h1) {
    h1.innerHTML = 'Trust, but verify.<br>Every contractor in King County.';
  }
}

function renderCategoryGrid() {
  const grid = $('#categoryGrid');
  if (!grid) return;

  /* The build writes this grid into index.html with real per-trade counts.
     Leave it alone when it is already there — rewriting it would drop the
     counts and replace working links with markup that only exists after
     JavaScript runs. */
  if (!grid.children.length) {
    grid.innerHTML = CATEGORIES.map((c) => `
      <a class="cat" href="${esc(c.id)}/" data-cat="${esc(c.id)}">
        <svg class="cat__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${esc(c.icon)}"/></svg>
        <span class="cat__name">${esc(c.name)}</span>
        <span class="cat__blurb">${esc(c.blurb)}</span>
      </a>`).join('');
  }

  /* Plain clicks follow the href to the pre-rendered page. Modified clicks
     (new tab, new window, download) are left to the browser. */
  grid.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target.closest('.cat');
    if (!el) return;
    if (el.tagName === 'A') return;
    selectCategory(el.dataset.cat);
  });
}

/** Push the current state back into the form controls. */
function applyStateToControls() {
  $('#categorySelect').value = state.category ? state.category.id : '';
  $('#citySelect').value = state.city || '';
  $('#sortSelect').value = state.sort;
  $('#searchInput').value = state.search;
  $('#fBonded').checked = state.requireBonded;
  $('#fInsured').checked = state.requireInsured;
  $('#fCerts').checked = state.certsOnly;
}

function populateSelects() {
  const catSel = $('#categorySelect');
  catSel.innerHTML = '<option value="">All trades</option>' +
    CATEGORIES.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  $('#sortSelect').value = state.sort;

  const citySel = $('#citySelect');
  citySel.innerHTML = '<option value="">All King County</option>' +
    KING_COUNTY_CITIES.map((c) => `<option value="${esc(c)}">${esc(titleCase(c))}</option>`).join('');
}

function selectCategory(id) {
  state.category = CATEGORIES.find((c) => c.id === id) || null;
  state.page = 0;
  $('#categorySelect').value = state.category ? state.category.id : '';
  syncCertHint();
  syncUrl(true);
  document.body.classList.add('is-browsing');
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  load();
}

function syncCertHint() {
  const box = $('#certHint');
  if (!state.category || !state.category.certs || !state.category.certs.length) {
    box.hidden = true;
    return;
  }
  const items = state.category.certs
    .map((k) => CERT_PROGRAMS[k])
    .filter(Boolean)
    .map((p) => `<a href="${esc(p.verifyUrl)}" target="_blank" rel="noopener"
        class="hintcert hintcert--${esc(p.tier)}" title="${esc(p.what)}">${esc(p.label)}</a>`);
  box.innerHTML = `<strong>Certifications worth asking about for ${esc(state.category.name.toLowerCase())}:</strong>
    <div class="hintcerts">${items.join('')}</div>
    <p class="muted small">Click any credential to check it in the certifying body's own
    directory. The state's registration only tells you a contractor is legal to hire.</p>`;
  box.hidden = false;
}

function setStatus(msg, kind) {
  const el = $('#status');
  el.className = 'status' + (kind ? ' status--' + kind : '');
  el.innerHTML = msg;
}

async function load() {
  const myReq = ++state.reqId;
  state.loading = true;
  setStatus('Looking it up…', 'loading');
  $('#cards').setAttribute('aria-busy', 'true');

  try {
    const where = buildWhere();
    const [count, rows] = await Promise.all([
      state.page === 0 ? fetchCount(where) : Promise.resolve(state.total),
      fetchPage(where, state.page)
    ]);
    if (myReq !== state.reqId) return; // a newer request superseded this one

    state.total = count;
    const licenses = rows.map((r) => r.contractorlicensenumber).filter(Boolean);
    const coverage = await fetchCoverage(licenses);
    if (myReq !== state.reqId) return;

    const decorated = rows.map((r) => decorate(r, coverage));
    state.fetched = decorated.length;
    state.results = sortRecords(applyClientFilters(decorated));
    render();
  } catch (err) {
    if (myReq !== state.reqId) return;
    setStatus(
      `We could not reach the state's records. ${esc(err.message)}<br>
       <button class="btn btn--ghost" id="retryBtn">Try again</button>`, 'error');
    $('#cards').innerHTML = '';
    const retry = $('#retryBtn');
    if (retry) retry.addEventListener('click', load);
  } finally {
    state.loading = false;
    $('#cards').removeAttribute('aria-busy');
  }
}

function render() {
  const cards = $('#cards');
  const shown = state.results;

  if (!shown.length) {
    cards.innerHTML = '';
    setStatus(state.total === 0
      ? 'No active registrations match that.'
      : 'Your filters cleared this page. Loosen one, or try the next page.',
      'empty');
  } else {
    cards.innerHTML = shown.map(cardHTML).join('');
    // The total comes from the server; the bonded/insured filters run here, on
    // the page we fetched. Those two numbers cannot be blended into one honest
    // "1-24 of 92" range — doing so made later pages appear to skip entries.
    // So report them as the separate facts they are.
    const maxPage = Math.max(0, Math.ceil((state.total || 0) / PAGE_SIZE) - 1);
    const hidden = state.fetched - shown.length;
    setStatus(`Page <strong>${state.page + 1}</strong> of ${maxPage + 1} ·
      showing <strong>${shown.length}</strong>
      ${hidden > 0 ? `(${hidden} on this page lack current bond or insurance)` : ''}
      · <strong>${state.total.toLocaleString()}</strong> active
      ${state.category ? esc(state.category.name.toLowerCase()) : 'contractors'}
      in ${state.city ? esc(titleCase(state.city)) : 'King County'}
      · checked against the state's records just now`);
  }

  const maxPage = Math.max(0, Math.ceil((state.total || 0) / PAGE_SIZE) - 1);
  $('#prevBtn').disabled = state.page <= 0;
  $('#nextBtn').disabled = state.page >= maxPage;
  $('#pageLabel').textContent = `Page ${state.page + 1} of ${maxPage + 1}`;
  $('#pager').hidden = (state.total || 0) <= PAGE_SIZE;
}

let searchTimer = null;

function bindControls() {
  $('#categorySelect').addEventListener('change', (e) => {
    state.category = CATEGORIES.find((c) => c.id === e.target.value) || null;
    state.page = 0;
    syncCertHint();
    syncUrl(true);
    load();
  });

  $('#citySelect').addEventListener('change', (e) => {
    state.city = e.target.value;
    state.page = 0;
    syncUrl(true);
    load();
  });

  $('#sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    syncUrl(false);
    state.results = sortRecords(state.results);
    render();
  });

  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => {
      state.search = v;
      state.page = 0;
      syncUrl(false);
      load();
    }, 350);
  });

  $('#fBonded').addEventListener('change', (e) => {
    state.requireBonded = e.target.checked; state.page = 0; syncUrl(false); load();
  });
  $('#fInsured').addEventListener('change', (e) => {
    state.requireInsured = e.target.checked; state.page = 0; syncUrl(false); load();
  });
  $('#fCerts').addEventListener('change', (e) => {
    state.certsOnly = e.target.checked; state.page = 0; syncUrl(false); load();
  });

  $('#prevBtn').addEventListener('click', () => {
    if (state.page > 0) { state.page--; syncUrl(false); load(); window.scrollTo({ top: $('#results').offsetTop - 20, behavior: 'smooth' }); }
  });
  $('#nextBtn').addEventListener('click', () => {
    state.page++; syncUrl(false); load(); window.scrollTo({ top: $('#results').offsetTop - 20, behavior: 'smooth' });
  });

  $('#browseAll').addEventListener('click', () => {
    state.category = null;
    state.page = 0;
    $('#categorySelect').value = '';
    syncCertHint();
    syncUrl(true);
    document.body.classList.add('is-browsing');
    $('#results').scrollIntoView({ behavior: 'smooth' });
    load();
  });

  $('#themeToggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('kcc-theme', dark ? 'dark' : 'light'); } catch (e) {}
  });
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('kcc-theme'); } catch (e) {}
  const prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
}

async function init() {
  initTheme();
  await fetchRemoteReviews();   // no-op unless REVIEW_BACKEND.url is set
  buildRatings();
  renderCategoryGrid();
  populateSelects();
  bindControls();

  // Restore whatever the URL asked for before anything renders.
  const hadState = readUrl();
  applyStateToControls();
  syncCertHint();
  updateSeo();

  window.addEventListener('popstate', () => {
    state.category = null; state.city = ''; state.search = '';
    state.sort = 'name'; state.page = 0;
    state.requireBonded = true; state.requireInsured = true; state.certsOnly = false;
    readUrl();
    applyStateToControls();
    syncCertHint();
    updateSeo();
    load();
  });

  if (hadState) {
    document.body.classList.add('is-browsing');
    load();
  }
  /* Both of these are decorative, and the pre-rendered pages fill them in at
     build time. A missing one must not throw and take the rest of the boot
     sequence down with it. */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const dateEl = $('#dataDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

document.addEventListener('DOMContentLoaded', init);
