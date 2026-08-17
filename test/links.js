/* Link checker.
   --------------------------------------------------------------------------
   Extracts every external URL in the repo and reports the ones that do not
   resolve. Run it whenever you touch data/certifications.js, and every few
   months regardless — trade associations reorganise their sites constantly,
   and a certification guide whose "verify this" links 404 is worse than no
   guide at all.

     node test/links.js

   Needs real network access, so it is a manual tool rather than part of the
   headless suite (test/smoke.js runs offline against mocked responses).

   TWO THINGS THAT WILL FOOL YOU
   -----------------------------
   1. A 403 usually means bot-blocking, not a dead page. Several association
      sites sit behind filters that reject anything without a browser-shaped
      request. Those are reported separately as CHECK BY HAND — open them in
      a browser before deleting anything.
   2. Some sites answer 200 for a URL that renders their "page not found"
      template, and others redirect a dead path to /404.aspx. The status code
      alone will not catch those, so this also flags any final URL or title
      that looks like a 404 page.
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['.html', '.js', '.md'];
const SKIP_DIRS = new Set(['node_modules', '.git']);

// Placeholders, API endpoints called with query strings, and example values.
const IGNORE = [
  'http://www.w3.org/2000/svg',
  'https://..',
  'https://github.com/',
  'https://reviews.your-worker.workers.dev',
  'https://data.wa.gov/resource/',      // hit constantly by the app itself
  'https://www.google.com/maps/search/', // built per-listing at runtime
  'https://www.yelp.com/search',
  'https://secure.lni.wa.gov/verify/Detail.aspx',
  'https://www.ceramictilefoundation.org/..',
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (FILES.includes(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function collectUrls() {
  const found = new Map(); // url -> Set(files)
  for (const file of walk(ROOT, [])) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(/https?:\/\/[^\s"'<>)]+/g) || [];
    for (let url of matches) {
      url = url.replace(/[.,;]+$/, '');
      if (IGNORE.some((p) => url.startsWith(p))) continue;
      const rel = path.relative(ROOT, file);
      if (!found.has(url)) found.set(url, new Set());
      found.get(url).add(rel);
    }
  }
  return found;
}

const NOT_FOUND_HINT = /404|not found|page you.{0,20}looking for|no longer available/i;

async function check(url) {
  const opts = {
    redirect: 'follow',
    headers: {
      // Without a browser-shaped UA a good number of association sites 403.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*',
    },
  };

  try {
    let res = await fetch(url, Object.assign({ method: 'HEAD' }, opts));
    // Plenty of servers mishandle HEAD; fall back to GET before believing them.
    if (res.status === 405 || res.status === 501 || res.status >= 400) {
      res = await fetch(url, Object.assign({ method: 'GET' }, opts));
    }

    const finalUrl = res.url || url;
    let body = '';
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      body = (await res.text()).slice(0, 4000);
    }

    // A dead path redirected to a 404 template still answers 200.
    const looksDead = /\/404(\.|\/|$)/i.test(finalUrl) ||
      NOT_FOUND_HINT.test((body.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ''])[1] || '');

    if (res.status === 403) return { state: 'MANUAL', code: 403 };
    if (!res.ok) return { state: 'DEAD', code: res.status };
    if (looksDead) return { state: 'DEAD', code: String(res.status) + ' (404 page)' };
    return { state: 'OK', code: res.status };
  } catch (err) {
    return { state: 'MANUAL', code: err.message.slice(0, 40) };
  }
}

(async () => {
  const urls = collectUrls();
  console.log('Checking ' + urls.size + ' unique URLs...\n');

  const entries = [...urls.entries()];
  const results = [];
  const CONCURRENCY = 6;

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(async ([url, files]) => {
      const r = await check(url);
      return { url, files: [...files], ...r };
    }));
    settled.forEach((r) => {
      results.push(r);
      const mark = r.state === 'OK' ? '  ok  ' :
                   r.state === 'DEAD' ? ' DEAD ' : ' ???? ';
      console.log(mark + String(r.code).padEnd(16) + r.url);
    });
  }

  const dead = results.filter((r) => r.state === 'DEAD');
  const manual = results.filter((r) => r.state === 'MANUAL');

  if (dead.length) {
    console.log('\n--- BROKEN (' + dead.length + ') ---');
    dead.forEach((r) => console.log('  ' + r.url + '\n      in: ' + r.files.join(', ')));
  }
  if (manual.length) {
    console.log('\n--- CHECK BY HAND (' + manual.length + ') ---');
    console.log('  Blocked or unreachable from a script. Open in a browser before changing.');
    manual.forEach((r) => console.log('  ' + r.url + '  (' + r.code + ')'));
  }

  console.log('\n' + results.filter((r) => r.state === 'OK').length + '/' + results.length +
    ' resolved, ' + dead.length + ' broken, ' + manual.length + ' need a human');
  process.exit(dead.length ? 1 : 0);
})();
