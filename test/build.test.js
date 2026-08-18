#!/usr/bin/env node
/* ==========================================================================
   Checks on the generated site.
     node test/build.test.js <dir>
   Runs against a directory the pre-renderer has written. Nothing here needs
   the network — the build is driven by test/fixtures/li.json.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '/tmp/buildout');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n        ' + String(detail).slice(0, 400) : '')); }
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const HAND_WRITTEN = new Set(['about.html', 'certifications.html', 'rankings.html', 'review.html']);
const rel = (f) => path.relative(ROOT, path.isAbsolute(f) ? f : path.join(ROOT, f));
const files = walk(ROOT).filter((f) => !HAND_WRITTEN.has(rel(f)));
console.log('\nGenerated site: ' + files.length + ' HTML files under ' + ROOT + '\n');

/* ------------------------------------------------ content is in the markup */

console.log('Content is present without JavaScript');
{
  const trade = fs.readFileSync(path.join(ROOT, 'roofing/index.html'), 'utf8');
  const names = (trade.match(/class="card__name">/g) || []).length;
  ok('a trade page ships its listings as markup', names > 0, names + ' cards');
  ok('listings carry licence numbers', /class="mono">[A-Z0-9]{6,}</.test(trade));
  ok('the page states a count in prose', /businesses hold an active Washington/.test(trade));
  ok('no listing markup is left to JavaScript', !/id="cards"><\/div>/.test(trade));
}

/* --------------------------------------------------------------- artefacts */

console.log('\nNo template artefacts');
{
  const bad = [];
  for (const f of files) {
    const h = fs.readFileSync(f, 'utf8');
    for (const marker of ['undefined', 'NaN', '[object Object]', '${', 'Invalid Date']) {
      if (h.includes(marker)) bad.push(rel(f) + ' -> ' + marker);
    }
  }
  ok('no undefined / NaN / unresolved templates anywhere', bad.length === 0, bad.slice(0, 8).join('\n        '));
}

/* ------------------------------------------------------------------ schema */

console.log('\nStructured data');
{
  let blocks = 0, broken = [];
  const types = new Set();
  for (const f of files) {
    const h = fs.readFileSync(f, 'utf8');
    const found = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    for (const b of found) {
      blocks++;
      const json = b.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      try { types.add(JSON.parse(json)['@type']); }
      catch (e) { broken.push(rel(f) + ': ' + e.message); }
    }
  }
  ok('every JSON-LD block parses', broken.length === 0, broken.slice(0, 5).join('\n        '));
  ok('JSON-LD is on every page', blocks >= files.length, blocks + ' blocks / ' + files.length + ' pages');
  for (const t of ['BreadcrumbList', 'ItemList', 'FAQPage', 'Dataset', 'Report', 'WebSite'])
    ok('emits ' + t, types.has(t), [...types].join(', '));
}

/* ---------------------------------------------------------- internal links */

console.log('\nInternal links resolve');
{
  const SITE = 'https://nichkt.github.io/SeattleContractorList';
  const missing = new Set();
  const shipped = new Set(['certifications.html', 'about.html', 'rankings.html', 'review.html',
    'robots.txt', 'sitemap.xml']);

  for (const f of files) {
    const h = fs.readFileSync(f, 'utf8');
    for (const m of h.matchAll(/href="([^"#]+)"/g)) {
      let href = m[1];
      if (/^(https?:|mailto:|tel:|data:)/.test(href) && !href.startsWith(SITE)) continue;
      if (href.startsWith(SITE)) href = href.slice(SITE.length).replace(/^\//, '');
      else {
        const from = path.dirname(rel(f));
        href = path.normalize(path.join(from === '.' ? '' : from, href));
      }
      href = href.replace(/^\.\//, '').replace(/\/$/, '/index.html') || 'index.html';
      if (href === '' || href === 'index.html') href = 'index.html';
      if (shipped.has(href)) continue;
      if (href.endsWith('/')) href += 'index.html';
      /* Static assets live in the repo and are not written by the renderer, so
         a build into a scratch directory will not contain them. Check those
         against the repo instead of against the output. */
      const where = /^(assets|data)\//.test(href)
        ? path.join(__dirname, '..', href)
        : path.join(ROOT, href);
      if (!fs.existsSync(where)) missing.add(href + '  <- ' + rel(f));
    }
  }
  ok('no internal link points at a page that was not built', missing.size === 0,
     [...missing].slice(0, 10).join('\n        '));
}

/* -------------------------------------------------------------- honesty */

console.log('\nClaims the data supports');
{
  const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  /* "Unbonded" is allowed in a question or a disclaimer and never as a claim
     about a business. These are the shapes a claim would take. */
  const asserted = [
    /\b(is|are|was|were)\s+unbonded\b/i,
    /\bunbonded\s+contractors?\s+(in|of|across)\b/i,
    /\d[\d,]*\s+unbonded\b/i
  ].filter((re) => re.test(all));
  ok('never asserts that a contractor is unbonded', asserted.length === 0,
     asserted.map(String).join('  '));
  ok('the "not the same as unbonded" caveat is present',
     /not the same as being unbonded/i.test(all));
  ok('bond figures are the post-2024 amounts', all.includes('$30,000') && all.includes('$15,000'));
  ok('the old $12,000 figure only appears as history',
     !/asks \$12,000|requires \$12,000/.test(all));
  ok('says "publishes no current bond", not "has no bond"',
     /publishes no current bond|No current bond published/.test(all));
  const numbers = fs.readFileSync(path.join(ROOT, 'numbers/index.html'), 'utf8');
  ok('the numbers page states the bond-file caveat', /flat|describes the file|property of the file/i.test(numbers));
  ok('insurance scope is disclosed', /construction and plumbing/i.test(numbers));
}

/* ------------------------------------------------------------- pagination */

console.log('\nPagination');
{
  const paged = files.filter((f) => /\/page\/\d+\//.test(f));
  ok('later pages were emitted', paged.length > 0, paged.length + ' paginated pages');
  if (paged.length) {
    const h = fs.readFileSync(paged[0], 'utf8');
    ok('a later page canonicalises to itself, not to page 1',
       /<link rel="canonical" href="[^"]*page\/\d+\/">/.test(h));
    ok('a later page links back with rel=prev', /rel="prev"/.test(h));
  }
  const first = fs.readFileSync(path.join(ROOT, 'general/index.html'), 'utf8');
  ok('page one links forward with rel=next', /rel="next"/.test(first));
  ok('no page carries more than 60 listings',
     files.every((f) => (fs.readFileSync(f, 'utf8').match(/class="card__name"/g) || []).length <= 60));
}

/* ---------------------------------------------------------------- sitemap */

console.log('\nSitemap');
{
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok('sitemap covers every generated page', locs.length >= files.length,
     locs.length + ' urls / ' + files.length + ' pages');
  ok('no query-string URLs remain', !locs.some((l) => l.includes('?')),
     locs.filter((l) => l.includes('?')).slice(0, 3).join(', '));
  ok('every sitemap URL is absolute', locs.every((l) => l.startsWith('https://')));
  const dupes = locs.filter((l, i) => locs.indexOf(l) !== i);
  ok('no duplicate URLs', dupes.length === 0, dupes.slice(0, 5).join(', '));
}

/* ------------------------------------------------------------------ head */

console.log('\nHead and metadata');
{
  const problems = [];
  for (const f of files) {
    const h = fs.readFileSync(f, 'utf8');
    const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const desc = (h.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    if (title.length < 15 || title.length > 95) problems.push(rel(f) + ' title ' + title.length + ' chars');
    if (desc.length < 50 || desc.length > 200) problems.push(rel(f) + ' description ' + desc.length + ' chars');
    if (!/<link rel="canonical"/.test(h)) problems.push(rel(f) + ' no canonical');
  }
  ok('titles and descriptions are within sane lengths, canonical present',
     problems.length === 0, problems.slice(0, 8).join('\n        '));

  const titles = files.map((f) => (fs.readFileSync(f, 'utf8').match(/<title>([^<]*)</) || [])[1]);
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  ok('no two pages share a title', dupes.length === 0, [...new Set(dupes)].slice(0, 5).join(' | '));
}

/* ------------------------------------------------------------------ prose */

/* The same voice checks smoke.js runs over the hand-written pages, applied to
   the generated copy. Templated writing drifts toward the stock phrasing just
   as easily as hand-written writing does, and there is far more of it. */

console.log('\nGenerated prose');
{
  const BANNED = [
    'delve', 'a testament to', 'it is worth noting', 'it should be noted',
    'furthermore', 'moreover', 'when it comes to', 'in today',
    'navigate the', 'plays a role', 'it turns out', 'actually',
    'in conclusion', 'that being said', 'at the end of the day'
  ];

  const detag = (h) => h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '\u2014').replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();

  /* Pull the blocks that hold sentences and leave the furniture alone. */
  const PROSE = /<(p|li)\b[^>]*class="(?:hero__lede|section__sub|calc__foot)"[^>]*>([\s\S]*?)<\/\1>|<div class="faq__a">([\s\S]*?)<\/div>|<article class="wrap section prose">([\s\S]*?)<\/article>|<ol class="steps">([\s\S]*?)<\/ol>/g;

  function proseOf(html) {
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                     .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const out = [];
    for (const m of body.matchAll(PROSE)) {
      const chunk = m[2] || m[3] || m[4] || m[5] || '';
      for (const para of chunk.split(/<\/(?:p|li)>/)) {
        const t = detag(para);
        if (t.length > 25) out.push(t);
      }
    }
    return out;
  }

  /* One page of each shape. Every other page of that shape comes from the same
     template, so checking all 100 would just be the same assertion repeated. */
  const sample = ['index.html', 'roofing/index.html', 'roofing/seattle/index.html',
                  'numbers/index.html', 'report/2026/index.html',
                  'verify/index.html', 'bond-calculator/index.html']
    .filter((f) => fs.existsSync(path.join(ROOT, f)));

  const stockHits = [], longSentences = [], antitheses = [];
  let dashTotal = 0, charTotal = 0, wordSum = 0, sentCount = 0;

  let blocks = 0;
  for (const f of sample) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const paras = proseOf(html);
    blocks += paras.length;
    const text = paras.join(' ');
    const lower = text.toLowerCase();
    for (const w of BANNED) if (lower.includes(w)) stockHits.push(f + ': "' + w + '"');

    dashTotal += (text.match(/\u2014/g) || []).length;
    charTotal += text.length;

    for (const m of text.match(/\bnot [a-z][^.!?]{0,40}[,\u2014][^.!?]{0,40}\bbut\b/gi) || [])
      antitheses.push(f + ': ' + m);

    for (const para of paras) {
      for (const sent of para.split(/(?<=[.!?])\s+/)) {
        const words = sent.trim().split(/\s+/).filter(Boolean);
        if (words.length < 3) continue;
        sentCount++; wordSum += words.length;
        if (words.length > 34) longSentences.push(f + ': ' + sent.trim().slice(0, 120));
      }
    }
  }
  ok('found prose to measure', blocks >= 40, blocks + ' blocks across ' + sample.length + ' pages');

  ok('no stock phrases in generated copy', stockHits.length === 0, stockHits.slice(0, 5).join('\n        '));
  ok('no not-X-but-Y antithesis', antitheses.length === 0, antitheses.slice(0, 3).join('\n        '));
  ok('no runaway sentences', longSentences.length === 0, longSentences.slice(0, 3).join('\n        '));
  const per1k = dashTotal / charTotal * 1000;
  ok('em-dashes stay sparse (' + dashTotal + ' across ' + sample.length + ' pages)',
     per1k < 1.2, per1k.toFixed(2) + ' per 1000 chars');
  const avg = wordSum / (sentCount || 1);
  ok('average sentence under 20 words (' + avg.toFixed(1) + ')', avg < 20);
}

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
