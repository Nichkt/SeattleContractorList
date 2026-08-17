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

function titleCase(str) {
  return String(str || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
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

function ratingHTML(record) {
  const r = record.rating;
  if (!r) {
    return `<div class="rating rating--none">
      <span class="rating__na">Not yet rated</span>
      <a class="rating__add" href="review.html?ubi=${esc(record.ubi)}&name=${encodeURIComponent(titleCase(record.businessname))}">Write the first review →</a>
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
      ${r.provisional ? '<span class="rating__prov" title="Too few reviews to be reliable. The score is pulled toward the average until more arrive.">provisional</span>' : ''}
    </div>
    <div class="rating__bar"><span style="width:${scoreBar(r.score)}%"></span></div>
    <details class="rating__more">
      <summary>Score breakdown</summary>
      <div class="axes">${axes}</div>
      <p class="muted small">
        Unadjusted average ${r.rawMean.toFixed(2)} from ${r.count} review${r.count === 1 ? '' : 's'}.
        The displayed score is pulled toward the King County average until a
        business earns enough reviews to move it — which is why a handful of
        glowing reviews cannot manufacture a high score.
        <a href="about.html#scoring">How scoring works</a>
      </p>
      <a class="btn btn--ghost" href="review.html?ubi=${esc(record.ubi)}&name=${encodeURIComponent(titleCase(record.businessname))}">Write a review</a>
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

function reviewLine(record) {
  const o = record.overlay;
  if (!o || !o.reviews) return '';
  const parts = [];
  if (o.reviews.google && o.reviews.google.count) {
    parts.push(`<a href="${esc(o.reviews.google.url || '#')}" target="_blank" rel="noopener">
      Google ${esc(o.reviews.google.rating || '')}★ · ${esc(o.reviews.google.count)} reviews</a>`);
  }
  if (o.reviews.yelp && o.reviews.yelp.count) {
    parts.push(`<a href="${esc(o.reviews.yelp.url || '#')}" target="_blank" rel="noopener">
      Yelp ${esc(o.reviews.yelp.rating || '')}★ · ${esc(o.reviews.yelp.count)} reviews</a>`);
  }
  if (!parts.length) return '';
  return '<div class="reviews">' + parts.join('<span class="sep">·</span>') + '</div>';
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
    ${reviewLine(record)}

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
    </div>

    <details class="card__more">
      <summary>Bond &amp; insurance detail</summary>
      <div class="detail-grid">
        <div>
          <h4>Surety bond</h4>
          ${b ? `<p>${esc(b.bondfirmname || '—')}<br>
                 Amount ${fmtMoney(b.bondamt)}<br>
                 Effective ${fmtDate(b.bondeffectivedate)}<br>
                 Expires ${fmtDate(b.bondexpirationdate)}</p>`
              : '<p class="muted">No bond record returned by L&amp;I.</p>'}
        </div>
        <div>
          <h4>Liability insurance</h4>
          ${i ? `<p>${esc(i.insurancecompany || '—')}<br>
                 Coverage ${fmtMoney(i.insuranceamt)}<br>
                 Policy <span class="mono">${esc(i.insurancepolicyno || '—')}</span><br>
                 Expires ${fmtDate(i.expirationdate)}</p>`
              : '<p class="muted">No insurance record returned by L&amp;I.</p>'}
        </div>
      </div>
      ${record.primaryprincipalname
        ? `<p class="muted">Principal: ${esc(titleCase(record.primaryprincipalname))}</p>` : ''}
      <a class="btn btn--primary" href="${esc(lniVerifyUrl(record))}"
         target="_blank" rel="noopener">Verify on L&amp;I →</a>
    </details>
  </article>`;
}

/* ------------------------------------------------------------ UI wiring */

function renderCategoryGrid() {
  const grid = $('#categoryGrid');
  grid.innerHTML = CATEGORIES.map((c) => `
    <button class="cat" data-cat="${esc(c.id)}">
      <svg class="cat__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${esc(c.icon)}"/></svg>
      <span class="cat__name">${esc(c.name)}</span>
      <span class="cat__blurb">${esc(c.blurb)}</span>
    </button>`).join('');

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat');
    if (!btn) return;
    selectCategory(btn.dataset.cat);
  });
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
    <p class="muted small">Click any credential to check it in the certifying body's own directory.
    L&amp;I registration proves a contractor is legal to hire — it says nothing about craft.
    These do.</p>`;
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
  setStatus('Querying the L&amp;I registry…', 'loading');
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
    state.results = sortRecords(applyClientFilters(decorated));
    render();
  } catch (err) {
    if (myReq !== state.reqId) return;
    setStatus(
      `Could not reach the L&amp;I open-data service. ${esc(err.message)}<br>
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
      ? 'No active registrations match those filters.'
      : 'Every contractor on this page was filtered out by your bonded/insured/certified filters. Try loosening them or go to the next page.',
      'empty');
  } else {
    cards.innerHTML = shown.map(cardHTML).join('');
    const start = state.page * PAGE_SIZE + 1;
    const end = state.page * PAGE_SIZE + shown.length;
    setStatus(`Showing <strong>${start}–${end}</strong> of
      <strong>${state.total.toLocaleString()}</strong> active
      ${state.category ? esc(state.category.name.toLowerCase()) : 'contractors'}
      in ${state.city ? esc(titleCase(state.city)) : 'King County'}
      · verified live against L&amp;I`);
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
    load();
  });

  $('#citySelect').addEventListener('change', (e) => {
    state.city = e.target.value;
    state.page = 0;
    load();
  });

  $('#sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.results = sortRecords(state.results);
    render();
  });

  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => {
      state.search = v;
      state.page = 0;
      load();
    }, 350);
  });

  $('#fBonded').addEventListener('change', (e) => {
    state.requireBonded = e.target.checked; state.page = 0; load();
  });
  $('#fInsured').addEventListener('change', (e) => {
    state.requireInsured = e.target.checked; state.page = 0; load();
  });
  $('#fCerts').addEventListener('change', (e) => {
    state.certsOnly = e.target.checked; state.page = 0; load();
  });

  $('#prevBtn').addEventListener('click', () => {
    if (state.page > 0) { state.page--; load(); window.scrollTo({ top: $('#results').offsetTop - 20, behavior: 'smooth' }); }
  });
  $('#nextBtn').addEventListener('click', () => {
    state.page++; load(); window.scrollTo({ top: $('#results').offsetTop - 20, behavior: 'smooth' });
  });

  $('#browseAll').addEventListener('click', () => {
    state.category = null;
    $('#categorySelect').value = '';
    syncCertHint();
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
  $('#year').textContent = new Date().getFullYear();
  $('#dataDate').textContent = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

document.addEventListener('DOMContentLoaded', init);
