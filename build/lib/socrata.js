/* ==========================================================================
   Socrata client
   --------------------------------------------------------------------------
   One rule matters here and it is not obvious.

   *** Every paged request sends $order=:id. ***

   Socrata does not guarantee a stable row order. Without an explicit sort,
   $limit/$offset paging returns some rows twice and skips others. Measured on
   the bond dataset: an unordered pull of 80,000 rows held 31,171 distinct
   licence numbers; the identical pull with $order=:id held 37,508, which is
   what `select count(distinct contractorlicensenumber)` reports.

   Roughly a sixth of the file vanished silently. No error, no warning, just
   wrong numbers on every page that depends on it. See build/RESEARCH.md.
   ========================================================================== */

'use strict';

const BASE = 'https://data.wa.gov/resource/';
const PAGE = 10000;

const DATASETS = {
  general:   'm8qx-ubtq',
  bond:      'bzff-4fmt',
  insurance: 'ciwg-agsx'
};

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

async function request(dataset, params, attempt = 0) {
  const url = BASE + dataset + '.json?' + qs(params);
  const headers = { Accept: 'application/json' };
  if (process.env.SOCRATA_APP_TOKEN) {
    headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN;
  }
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    if (attempt < 4) return backoff(dataset, params, attempt, err.message);
    throw new Error('Network failure on ' + dataset + ': ' + err.message);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 4) return backoff(dataset, params, attempt, 'HTTP ' + res.status);
  }
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' from ' + dataset + ': ' + (await res.text()).slice(0, 300));
  }
  return res.json();
}

function backoff(dataset, params, attempt, why) {
  const wait = Math.round(700 * Math.pow(2, attempt));
  process.stderr.write('  retry ' + (attempt + 1) + '/4 on ' + dataset + ' (' + why + ') in ' + wait + 'ms\n');
  return new Promise((r) => setTimeout(r, wait)).then(() => request(dataset, params, attempt + 1));
}

/** A single aggregate or small query. No paging, no implicit ordering. */
async function query(dataset, params) {
  return request(DATASETS[dataset] || dataset, params);
}

/** Page an entire result set. Always sorted, for the reason at the top. */
async function pull(dataset, { select, where, order = ':id', max = 400000 } = {}) {
  const out = [];
  for (let offset = 0; offset < max; offset += PAGE) {
    const rows = await request(DATASETS[dataset] || dataset, {
      $select: select,
      $where: where,
      $order: order,
      $limit: PAGE,
      $offset: offset
    });
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  throw new Error(
    'Pull from ' + dataset + ' hit the ' + max + '-row ceiling. Raise `max` ' +
    'or narrow `where` — silently truncating would corrupt every statistic.'
  );
}

/** Verify a pull is complete by comparing against the server's own count. */
async function verifyCount(dataset, rows, label) {
  const [{ c }] = await query(dataset, { $select: 'count(*) as c' });
  const expected = Number(c);
  if (rows.length !== expected) {
    throw new Error(
      label + ': pulled ' + rows.length + ' rows but the API reports ' +
      expected + '. Paging lost data — check that $order is being sent.'
    );
  }
  return expected;
}

module.exports = { DATASETS, query, pull, verifyCount };
