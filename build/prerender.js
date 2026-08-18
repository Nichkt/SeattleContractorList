#!/usr/bin/env node
/* ==========================================================================
   Pre-render the site
   --------------------------------------------------------------------------
     node build/prerender.js            build into the repo root
     node build/prerender.js --out /tmp build somewhere else
     node build/prerender.js --dry      fetch and report, write nothing

   Why this exists: the site used to ship one 8 KB HTML shell that fetched
   everything from the browser, and 27 of its 31 sitemap URLs were query
   strings pointing back at that same shell. There was nothing on the page for
   a crawler to read. Now every listing is in the markup, and the live lookup
   runs on top of it for freshness.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const D = require('./lib/data');
const { tradePage, cityPage } = require('./lib/pages');
const { verifyPage, bondCalculatorPage } = require('./lib/tools');
const { numbersPage } = require('./lib/numbers');
const { reportPage } = require('./lib/report');
const R = require('./lib/render');
const { esc, titleCase, num, pct, slug, fmtMoney } = require('./lib/format');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const OUT = (() => {
  const i = args.indexOf('--out');
  return path.resolve(i >= 0 ? args[i + 1] : path.join(__dirname, '..'));
})();

const log = (m) => process.stdout.write(m + '\n');

/* ------------------------------------------------------------------- home */

function homePage(stats, byTrade) {
  const s = stats;
  const cats = D.CATEGORIES.map((c) => ({ cat: c, n: (byTrade.get(c.id) || []).length }))
    .filter((x) => x.n > 0);

  const faq = [
    {
      q: 'How many contractors are registered in King County?',
      a: `<p>${num(s.active)} businesses hold an active Washington contractor registration with
          a King County address. A further ${num(s.status.SUSPENDED || 0)} are currently
          suspended and ${num(s.status.EXPIRED || 0)} have expired — they still turn up in
          search results, so check before you call.</p>`
    },
    {
      q: 'What does this site do that the state site does not?',
      a: `<p>The state lets you look up one contractor at a time, if you already know who you
          are looking for. This joins the registry to the bond file and the insurance file and
          lets you browse — by trade, by city, sorted, filtered. Same records, same source,
          arranged so you can start from "I need a roofer" instead of from a licence number.</p>`
    },
    {
      q: 'How much is a contractor bond in Washington?',
      a: `<p>${fmtMoney(R.BOND_GENERAL)} for a general contractor and ${fmtMoney(R.BOND_SPECIALTY)}
          for a specialty contractor, since ${R.BOND_CHANGED}. Before that they were
          ${fmtMoney(12000)} and ${fmtMoney(6000)} and had not moved in twenty-two years.
          See what that covers on your job with the
          <a href="bond-calculator/">bond calculator</a>.</p>`
    },
    {
      q: 'Does a listing here mean you recommend them?',
      a: `<p>No. It means the paperwork is in order. Nobody pays to be listed, nobody is
          promoted, and no contractor can buy a position. That is the whole arrangement.</p>`
    },
    {
      q: 'How current is this?',
      a: `<p>The pages are rebuilt from the state's files every week — this one on
          ${new Date(s.generatedAt).toDateString()} — and the live lookup re-checks against
          L&amp;I when you open a page. A registration can still lapse between your reading
          and your signing, which is why every listing links to the state's own record.</p>`
    }
  ];

  const body = `
<section class="hero">
  <div class="wrap">
    <h1 id="heroTitle">Trust, but verify.<br>Every contractor in King County.</h1>
    <p class="hero__lede">
      Before you hire someone to work on your house, you should know they are licensed,
      bonded, and insured. ${num(s.active)} businesses hold an active registration here.
      The state confirms a current bond for ${num(s.bonded)} of them and current liability
      insurance for ${num(s.insured)} of the ${num(s.insuranceScope)} it covers. Three green
      marks mean all three check out.
    </p>

    <div class="hero__search">
      <label class="field field--grow">
        <span class="field__label">Search by business name</span>
        <input type="search" id="searchInput" placeholder="Cascade, Emerald, Rainier…" autocomplete="off">
      </label>
      <button class="btn btn--primary" id="browseAll">Browse all trades</button>
    </div>

    <p class="hero__note">
      Read from <span class="mono">data.wa.gov</span>. Pages rebuilt
      ${new Date(s.generatedAt).toDateString()}. Loaded <span id="dataDate"></span>.
    </p>
  </div>
</section>

<section class="wrap section">
  <h2 class="section__title">Pick a trade</h2>
  <p class="section__sub">
    These categories come from the state's own license and specialty codes. A contractor
    shows up under a trade only if the state registered him for it. Nobody pays to be
    listed here.
  </p>
  <div class="catgrid" id="categoryGrid">${cats.map(({ cat, n }) => `
    <a class="cat" href="${esc(cat.id)}/" data-cat="${esc(cat.id)}">
      <svg class="cat__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${esc(cat.icon)}"/></svg>
      <span class="cat__name">${esc(cat.name)}</span>
      <span class="cat__blurb">${esc(cat.blurb)}</span>
      <span class="cat__n">${num(n)}</span>
    </a>`).join('')}</div>
</section>

<section class="wrap section">
  <h2 class="section__title">Start somewhere useful</h2>
  <div class="promos">
    <a class="promo" href="verify/">
      <h3>Check one contractor</h3>
      <p>You have a name and a quote in your hand. Type it in and see what the state says
         about their registration, bond, and insurance.</p>
    </a>
    <a class="promo" href="bond-calculator/">
      <h3>See what the bond covers</h3>
      <p>"Bonded" sounds like protection. On a ${fmtMoney(90000)} kitchen a
         ${fmtMoney(R.BOND_GENERAL)} bond covers a third of it, and you may be sharing.</p>
    </a>
    <a class="promo" href="numbers/">
      <h3>The county's numbers</h3>
      <p>${num(s.status.SUSPENDED || 0)} suspended registrations, ${pct(s.insuredPct)} carrying
         insurance, and what the state's files do not tell you.</p>
    </a>
  </div>
</section>

<section class="wrap section" id="results">
  <h2 class="section__title">Search the whole county</h2>

  <div class="controls">
    <label class="field">
      <span class="field__label">Trade</span>
      <select id="categorySelect"></select>
    </label>
    <label class="field">
      <span class="field__label">City</span>
      <select id="citySelect"></select>
    </label>
    <label class="field">
      <span class="field__label">Sort</span>
      <select id="sortSelect">
        <option value="score">Score (highest first)</option>
        <option value="name">Business name (A–Z)</option>
        <option value="certs">Certifications first</option>
        <option value="reviews">Most reviewed</option>
        <option value="tenure">Longest registered</option>
        <option value="city">City</option>
      </select>
    </label>
  </div>

  <div class="toggles">
    <label class="check"><input type="checkbox" id="fBonded" checked> <span>Current bond required</span></label>
    <label class="check"><input type="checkbox" id="fInsured" checked> <span>Current insurance required</span></label>
    <label class="check"><input type="checkbox" id="fCerts"> <span>Only trade-certified</span></label>
  </div>

  <div class="hint" id="certHint" hidden></div>
  <div class="status" id="status">Pick a trade above and we will look it up.</div>
  <div class="cards" id="cards"></div>

  <div class="pager" id="pager" hidden>
    <button class="btn btn--ghost" id="prevBtn">← Previous</button>
    <span id="pageLabel" class="pager__label"></span>
    <button class="btn btn--ghost" id="nextBtn">Next →</button>
  </div>
</section>

<section class="wrap section">
  <div class="callout">
    <h2>Five things to do before you sign</h2>
    <ol class="steps">
      <li><strong>Check the state's record yourself.</strong> Every listing links to it. A
        license can lapse between the day you read this and the day you sign.</li>
      <li><strong>Know how small the bond is.</strong> The state asks ${fmtMoney(R.BOND_GENERAL)}
        from a general contractor and ${fmtMoney(R.BOND_SPECIALTY)} from a specialty contractor,
        raised on ${R.BOND_CHANGED} from ${fmtMoney(12000)} and ${fmtMoney(6000)}. On a
        ${fmtMoney(90000)} kitchen that does not go far, and if you file a claim other
        homeowners may be ahead of you in line. A contractor who posts more than the law
        requires is worth a second look.</li>
      <li><strong>Get the insurance certificate from the carrier.</strong> Ask them to name
        your job on it. The state can tell you a policy exists. It cannot tell you your work
        is covered.</li>
      <li><strong>A license is not a test of skill.</strong> It means the paperwork is filed
        and the bond is posted. Nobody from the state watched the work. The credentials in
        our <a href="certifications.html">certification guide</a> are graded by people who
        did.</li>
      <li><strong>Read the complaint history.</strong> L&amp;I lists bond claims and
        infractions on its own pages. Most people skip it.</li>
    </ol>
  </div>
</section>

${R.faqSection(faq)}
`;

  return {
    path: 'index.html',
    depth: 0,
    html: R.shell({
      title: 'King County Contractor Directory — Licensed, Bonded & Insured',
      description: `All ${num(s.active)} registered contractors in King County, Washington — general, roofing, landscaping, electrical, plumbing and more — checked against the state registry for licence, bond, and insurance.`,
      canonical: R.SITE + '/',
      depth: 0,
      jsonld: [
        {
          '@context': 'https://schema.org', '@type': 'WebSite',
          name: 'King County Contractor Directory',
          url: R.SITE + '/',
          description: 'Every actively registered contractor in King County, Washington, checked against the Washington State L&I registry for licence, bond and insurance.',
          publisher: { '@type': 'Organization', name: 'King County Contractor Directory' }
        },
        R.faqSchema(faq)
      ],
      body
    }).replace('</body>', `<script src="data/categories.js"></script>
<script src="data/certifications.js"></script>
<script src="assets/scoring.js"></script>
<script src="data/reviews.js"></script>
<script src="assets/app.js"></script>
</body>`)
  };
}

/* ---------------------------------------------------------------- sitemap */

function sitemap(pages, stats) {
  const today = stats.generatedAt.slice(0, 10);
  const extra = ['certifications.html', 'about.html', 'rankings.html'];
  const urls = pages.map((p) => ({
    loc: R.SITE + '/' + p.path.replace(/index\.html$/, ''),
    pri: p.path === 'index.html' ? '1.0'
       : /\/page\/\d+\//.test(p.path) ? '0.3'
       : p.depth === 1 ? '0.8' : '0.6'
  })).concat(extra.map((e) => ({ loc: R.SITE + '/' + e, pri: '0.5' })));

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const started = Date.now();
  log('Pre-rendering into ' + OUT + (DRY ? '  (dry run)' : ''));

  const raw = await D.fetchAll(log);
  const indexed = D.index(raw);
  const byTrade = D.assign(indexed.records);
  const stats = D.statistics(raw, indexed, byTrade);

  log('');
  log('King County: ' + num(stats.active) + ' active, ' +
      num(stats.status.SUSPENDED || 0) + ' suspended, ' +
      num(stats.bonded) + ' with a published bond, ' +
      num(stats.insured) + '/' + num(stats.insuranceScope) + ' insured');

  const plan = D.pagePlan(byTrade);
  const tradeCount = plan.filter((p) => p.kind === 'trade').length;
  const cityCount = plan.filter((p) => p.kind === 'city').length;
  const distinctCities = new Set(plan.filter((p) => p.kind === 'city')
    .map((p) => p.trade.id + '/' + p.city)).size;
  log('Page plan: ' + tradeCount + ' trade pages across ' + D.CATEGORIES.length +
      ' trades, ' + cityCount + ' city pages across ' + distinctCities +
      ' trade-city pairs (floor ' + D.CITY_PAGE_FLOOR + ', ' + D.PER_PAGE + ' per page)');

  const pages = [homePage(stats, byTrade)];
  for (const p of plan) {
    if (p.kind === 'trade') {
      pages.push(tradePage({
        trade: p.trade, records: p.records, all: p.all,
        page: p.page, pages: p.pages, totalRecords: p.totalRecords,
        cities: D.cityBreakdown(p.all), stats
      }));
    } else {
      pages.push(cityPage({
        trade: p.trade, city: p.city, records: p.records,
        page: p.page, pages: p.pages, totalRecords: p.totalRecords, stats
      }));
    }
  }
  pages.push(verifyPage(stats), bondCalculatorPage(stats), numbersPage(stats), reportPage(stats));

  log('Rendered ' + pages.length + ' pages');

  if (DRY) {
    log('Dry run — nothing written.');
    return { pages, stats };
  }

  let bytes = 0, rawBytes = 0;
  for (const p of pages) {
    const dest = path.join(OUT, p.path);
    const out = R.squeeze(p.html);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
    rawBytes += Buffer.byteLength(p.html);
    bytes += Buffer.byteLength(out);
  }
  log('Whitespace squeezed: ' + (rawBytes / 1024 / 1024).toFixed(1) + ' MB -> ' +
      (bytes / 1024 / 1024).toFixed(1) + ' MB (' +
      (100 - bytes / rawBytes * 100).toFixed(0) + '% off)');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(pages, stats));
  fs.writeFileSync(
    path.join(OUT, 'data', 'stats.json'),
    JSON.stringify(stats, null, 2)
  );

  log('Wrote ' + pages.length + ' pages (' + (bytes / 1024 / 1024).toFixed(1) + ' MB), ' +
      'sitemap.xml with ' + (pages.length + 3) + ' URLs, and data/stats.json');
  log('Done in ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  return { pages, stats };
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('\nBUILD FAILED: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = { main, homePage, sitemap };
