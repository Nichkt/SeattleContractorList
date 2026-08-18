'use strict';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Words that stay lowercase inside a name, never at the start. */
const SMALL = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an']);

/* Initialisms that read wrong in title case. "ABC HVAC LLC", not
   "Abc Hvac Llc". Company suffixes like Inc and Co are deliberately NOT here
   because they read better cased normally. */
const KEEP = new Set([
  'LLC', 'PLLC', 'LLP', 'LP', 'PC', 'PS', 'USA', 'US', 'HVAC', 'PNW',
  'NW', 'NE', 'SW', 'SE', 'WA', 'DBA', 'II', 'III', 'IV', 'V',
  'CNC', 'PVC', 'HDPE', 'LED', 'AC', 'TV', 'RV', 'ADU', 'GC'
]);

function titleCase(s) {
  if (!s) return '';
  return String(s).toLowerCase().split(/\s+/).map((w, i) => {
    const up = w.toUpperCase().replace(/[^A-Z]/g, '');
    if (KEEP.has(up)) return w.toUpperCase();
    if (i > 0 && SMALL.has(w)) return w;
    return w.replace(/^[a-z]/, (c) => c.toUpperCase())
            // Uppercase after a hyphen or slash always. After an apostrophe
            // only when more than one letter follows, so "Dave's" keeps its
            // possessive lowercase while "O'Brien" does not.
            .replace(/([-/])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
            .replace(/'([a-z]{2,})/g, (m, rest) => "'" + rest[0].toUpperCase() + rest.slice(1));
  }).join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);           // e.g. "Until Canceled"
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

function fmtMoney(v) {
  const n = Number(v);
  if (!isFinite(n) || !n) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtPhone(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  if (d.length === 11 && d[0] === '1') return fmtPhone(d.slice(1));
  return String(v || '');
}

const slug = (s) => String(s).toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* Never round a percentage up to 100% unless it really is 100%, and never
   down to 0% unless it really is 0%. On this site the tile that reads "100%
   carry current insurance" is a claim about named businesses, and 99.8% is
   twenty-nine companies that do not. */
function pct(n, digits = 0) {
  const rounded = Number(n.toFixed(digits));
  if (rounded >= 100 && n < 100) return (Math.floor(n * 10) / 10).toFixed(1) + '%';
  if (rounded <= 0 && n > 0) return (Math.ceil(n * 10) / 10).toFixed(1) + '%';
  return n.toFixed(digits) + '%';
}
const num = (n) => Number(n).toLocaleString('en-US');

module.exports = { esc, titleCase, fmtDate, fmtMoney, fmtPhone, slug, pct, num };
