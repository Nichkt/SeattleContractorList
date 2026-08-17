/* Headless smoke test.
   The sandbox cannot reach data.wa.gov, so every Socrata call is intercepted
   and answered with fixtures. This verifies: query construction, the
   three-dataset join, bonded/insured derivation, filtering, sorting,
   rendering, pagination, and that no page throws a JS error. */

const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'file://' + ROOT;

const GENERAL = [
  { businessname: 'ALPHA TILE WORKS LLC', contractorlicensenumber: 'ALPHATW111AA',
    contractorlicensetypecodedesc: 'CONSTRUCTION CONTRACTOR',
    specialtycode1: 'RE', specialtycode1desc: 'Tile, Ceramic, Mosaic, Natural and MFG Stone',
    address1: '100 1ST AVE', city: 'SEATTLE', state: 'WA', zip: '98101',
    phonenumber: '2065551234', licenseeffectivedate: '2010-04-01T00:00:00.000',
    licenseexpirationdate: '2030-04-01T00:00:00.000', ubi: '600000001',
    primaryprincipalname: 'DOE, JANE', businesstypecodedesc: 'Limited Liability Company' },
  { businessname: 'BRAVO TILE & STONE INC', contractorlicensenumber: 'BRAVOTS222BB',
    contractorlicensetypecodedesc: 'CONSTRUCTION CONTRACTOR',
    specialtycode1: 'RE', specialtycode1desc: 'Tile, Ceramic, Mosaic, Natural and MFG Stone',
    address1: '200 PINE ST', city: 'BELLEVUE', state: 'WA', zip: '98004',
    phonenumber: '4255559876', licenseeffectivedate: '2018-06-15T00:00:00.000',
    licenseexpirationdate: '2029-06-15T00:00:00.000', ubi: '600000002',
    primaryprincipalname: 'SMITH, JOHN', businesstypecodedesc: 'Corporation' },
  { businessname: 'CHARLIE LAPSED TILE CO', contractorlicensenumber: 'CHARLLT333CC',
    contractorlicensetypecodedesc: 'CONSTRUCTION CONTRACTOR',
    specialtycode1: 'RE', specialtycode1desc: 'Tile, Ceramic, Mosaic, Natural and MFG Stone',
    address1: '300 OAK ST', city: 'KENT', state: 'WA', zip: '98032',
    phonenumber: '2535554321', licenseeffectivedate: '2021-01-05T00:00:00.000',
    licenseexpirationdate: '2028-01-05T00:00:00.000', ubi: '600000003',
    primaryprincipalname: 'LEE, SAM', businesstypecodedesc: 'Individual' }
];

// Alpha: current bond + current insurance  -> fully green
// Bravo: open-ended bond + current insurance -> fully green
// Charlie: expired bond + expired insurance  -> filtered out by default
const BOND = [
  { contractorlicensenumber: 'ALPHATW111AA', bondfirmname: 'Western Surety Co',
    bondaccountid: '111', bondamt: '12000.0000',
    bondeffectivedate: '2024-01-01T00:00:00.000', bondexpirationdate: '2030-01-01T00:00:00.000' },
  { contractorlicensenumber: 'ALPHATW111AA', bondfirmname: 'Old Surety',
    bondaccountid: '110', bondamt: '6000.0000',
    bondeffectivedate: '2015-01-01T00:00:00.000', bondexpirationdate: '01/01/2020' },
  { contractorlicensenumber: 'BRAVOTS222BB', bondfirmname: 'Merchants Bonding',
    bondaccountid: '222', bondamt: '30000.0000',
    bondeffectivedate: '2023-05-01T00:00:00.000', bondexpirationdate: 'Until Canceled' },
  { contractorlicensenumber: 'CHARLLT333CC', bondfirmname: 'Lapsed Surety',
    bondaccountid: '333', bondamt: '6000.0000',
    bondeffectivedate: '2019-01-01T00:00:00.000', bondexpirationdate: '01/01/2021' }
];

const INSURANCE = [
  { contractorlicensenumber: 'ALPHATW111AA', insurancecompany: 'Ohio Security Ins Co',
    insurancepolicyno: 'BKS111', insuranceamt: '1000000.0000',
    effectivedate: '2025-01-01T00:00:00.000', expirationdate: '2029-01-01T00:00:00.000',
    insuranceagencyname: 'Test Agency' },
  { contractorlicensenumber: 'BRAVOTS222BB', insurancecompany: 'Cincinnati Ins Co',
    insurancepolicyno: 'BKS222', insuranceamt: '2000000.0000',
    effectivedate: '2026-01-01T00:00:00.000', expirationdate: '2028-01-01T00:00:00.000',
    insuranceagencyname: 'Test Agency' },
  { contractorlicensenumber: 'CHARLLT333CC', insurancecompany: 'Gone Ins Co',
    insurancepolicyno: 'BKS333', insuranceamt: '1000000.0000',
    effectivedate: '2018-01-01T00:00:00.000', expirationdate: '2020-01-01T00:00:00.000',
    insuranceagencyname: 'Test Agency' }
];

const SIX_AXES = ['Workmanship', 'Communication', 'Schedule', 'Value', 'Site conduct', 'Follow-up'];

const seen = { urls: [] };

function respond(route, body) {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage();

  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });

  await page.route('**/data.wa.gov/**', (route) => {
    const url = route.request().url();
    seen.urls.push(url);
    if (url.includes('m8qx-ubtq')) {
      if (/%24select=count/.test(url) || /\$select=count/.test(url)) {
        return respond(route, [{ count: String(GENERAL.length) }]);
      }
      return respond(route, GENERAL);
    }
    if (url.includes('bzff-4fmt')) return respond(route, BOND);
    if (url.includes('ciwg-agsx')) return respond(route, INSURANCE);
    return respond(route, []);
  });

  const results = [];
  const check = (name, cond, extra) => {
    results.push({ name, pass: !!cond, extra: cond ? '' : (extra || '') });
  };

  /* ---------------------------------------------------------- index.html */
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('#categoryGrid .cat');

  check('category grid renders all categories',
    (await page.locator('#categoryGrid .cat').count()) === 27,
    'got ' + (await page.locator('#categoryGrid .cat').count()));

  // Select the Tile category and wait for results.
  await page.selectOption('#categorySelect', 'tile');
  await page.waitForSelector('.card', { timeout: 10000 });

  const cardCount = await page.locator('.card').count();
  check('default filters hide the lapsed contractor', cardCount === 2,
    'expected 2 cards, got ' + cardCount);

  const names = await page.locator('.card__name').allTextContents();
  check('lapsed company excluded by default',
    !names.join('|').toLowerCase().includes('charlie'), names.join('|'));

  // Query construction.
  const generalUrl = seen.urls.find((u) => u.includes('m8qx-ubtq') && !u.includes('count'));
  const decoded = decodeURIComponent(generalUrl || '');
  check('query filters to ACTIVE', decoded.includes("contractorlicensestatus='ACTIVE'"), decoded);
  check('query filters to King County cities', decoded.includes("upper(city) in('ALGONA'"), decoded);
  check('query filters by specialty CODE, not description',
    decoded.includes("specialtycode1 in('RE')") &&
    !decoded.includes('specialtycode1desc in('), decoded);
  check('query constrains license type',
    decoded.includes("contractorlicensetypecodedesc in('CONSTRUCTION CONTRACTOR')"), decoded);
  check('query excludes expired registrations', decoded.includes('licenseexpirationdate >'), decoded);

  // Bond/insurance join correctness.
  const alphaCard = page.locator('.card', { hasText: 'Alpha Tile Works' });
  const alphaPills = await alphaCard.locator('.pill--yes').allTextContents();
  check('Alpha shows all three green pills', alphaPills.length === 3,
    'got ' + alphaPills.length + ': ' + alphaPills.join(','));

  await alphaCard.locator('summary').click();
  const alphaDetail = await alphaCard.locator('.detail-grid').innerText();
  check('Alpha picks the CURRENT bond, not the expired one',
    alphaDetail.includes('Western Surety') && alphaDetail.includes('$12,000'), alphaDetail);

  const bravoCard = page.locator('.card', { hasText: 'Bravo Tile' });
  await bravoCard.locator('summary').click();
  const bravoDetail = await bravoCard.locator('.detail-grid').innerText();
  check('"Until Canceled" bond treated as current',
    (await bravoCard.locator('.pill--yes').count()) === 3 &&
    bravoDetail.includes('Until canceled'), bravoDetail);

  // Certification hint appears for tile and names CTEF.
  const hint = await page.locator('#certHint').innerText();
  check('tile cert hint surfaces CTEF Certified Tile Installer',
    hint.includes('CTEF Certified Tile Installer'), hint);
  check('tile cert hint surfaces ACT', hint.includes('Advanced Certifications'), hint);

  // Turning filters off should reveal the lapsed company.
  await page.uncheck('#fBonded');
  await page.uncheck('#fInsured');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3, null, { timeout: 10000 });
  const names2 = (await page.locator('.card__name').allTextContents()).join('|');
  check('lapsed company appears when filters relaxed',
    names2.toLowerCase().includes('charlie'), names2);

  const charlieCard = page.locator('.card', { hasText: 'Charlie Lapsed' });
  check('lapsed company shows red bond+insurance pills',
    (await charlieCard.locator('.pill--no').count()) === 2,
    'got ' + (await charlieCard.locator('.pill--no').count()));

  // Verify link is well formed.
  await charlieCard.locator('summary').click();
  const verifyHref = await charlieCard.locator('a.btn--primary').getAttribute('href');
  check('L&I verify deep link includes UBI and license',
    verifyHref.includes('UBI=600000003') && verifyHref.includes('LIC=CHARLLT333CC'), verifyHref);

  // Search debounce + query.
  await page.fill('#searchInput', "O'BRIEN");
  await page.waitForTimeout(700);
  const searchUrl = decodeURIComponent(
    seen.urls.filter((u) => u.includes('m8qx-ubtq') && !u.includes('count')).pop());
  check('single quotes are escaped in search (SoQL injection guard)',
    searchUrl.includes("O''BRIEN"), searchUrl);

  /* ------------------------------------------------------------ URL state */

  // file:// forbids history.pushState, so URL state is exercised on a data-less
  // http origin via Playwright's routing instead of the file loads used above.
  {
    const u = new URL('http://kcc.test/index.html');
    await page.route('http://kcc.test/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      const map = { '/index.html': 'index.html', '/assets/app.js': 'assets/app.js',
        '/assets/scoring.js': 'assets/scoring.js', '/assets/styles.css': 'assets/styles.css',
        '/data/categories.js': 'data/categories.js', '/data/certifications.js': 'data/certifications.js',
        '/data/reviews.js': 'data/reviews.js' };
      if (!map[p]) return route.fulfill({ status: 404, body: '' });
      const type = p.endsWith('.css') ? 'text/css'
        : p.endsWith('.js') ? 'text/javascript' : 'text/html';
      return route.fulfill({ status: 200, contentType: type,
        body: require('fs').readFileSync(require('path').join(ROOT, map[p]), 'utf8') });
    });

    await page.goto('http://kcc.test/index.html?trade=tile&city=SEATTLE&sort=name');
    await page.waitForSelector('.card', { timeout: 10000 });

    check('a shared URL restores the trade filter',
      (await page.locator('#categorySelect').inputValue()) === 'tile',
      await page.locator('#categorySelect').inputValue());
    check('a shared URL restores the city filter',
      (await page.locator('#citySelect').inputValue()) === 'SEATTLE',
      await page.locator('#citySelect').inputValue());
    check('the page title reflects the trade and city, not a generic homepage',
      (await page.title()).includes('Tile') && (await page.title()).includes('Seattle'),
      await page.title());
    check('meta description is rewritten for the view',
      (await page.getAttribute('meta[name="description"]', 'content')).toLowerCase().includes('seattle'), '');
    check('a canonical link is present',
      !!(await page.getAttribute('link[rel="canonical"]', 'href')), '');

    // Changing a filter must be reflected in the address bar.
    await page.selectOption('#citySelect', 'KENT');
    await page.waitForTimeout(400);
    check('changing a filter updates the URL',
      page.url().includes('city=KENT'), page.url());

    await page.goBack();
    await page.waitForTimeout(600);
    check('browser back restores the previous filter',
      page.url().includes('city=SEATTLE') &&
      (await page.locator('#citySelect').inputValue()) === 'SEATTLE',
      page.url() + ' / ' + await page.locator('#citySelect').inputValue());

    await page.unroute('http://kcc.test/**');
    await page.goto(BASE + '/index.html');
    await page.selectOption('#categorySelect', 'tile');
    await page.waitForSelector('.card', { timeout: 10000 });
  }

  /* --------------------------------------------------- external review links */

  const alphaLinks = page.locator('.card', { hasText: 'Alpha Tile Works' }).locator('.extlink');
  check('every listing links to a website, Google and Yelp',
    (await alphaLinks.count()) === 3, 'got ' + (await alphaLinks.count()));

  const siteHref = await alphaLinks.nth(0).getAttribute('href');
  const gHref = await alphaLinks.nth(1).getAttribute('href');
  const yHref = await alphaLinks.nth(2).getAttribute('href');

  check('unverified website falls back to a scoped search',
    siteHref.startsWith('https://www.google.com/search?q=') &&
    decodeURIComponent(siteHref).includes('Alpha Tile Works Llc Seattle WA'), siteHref);
  check('an unconfirmed website is labelled "Find site", never presented as theirs',
    (await alphaLinks.nth(0).innerText()).trim().toLowerCase().includes('find site'),
    await alphaLinks.nth(0).innerText());
  check('Google link scopes the search to the business and city',
    gHref.startsWith('https://www.google.com/maps/search/') &&
    decodeURIComponent(gHref).includes('Alpha Tile Works Llc Seattle WA'), gHref);
  check('Yelp link scopes the search to the business and city',
    yHref.startsWith('https://www.yelp.com/search') &&
    decodeURIComponent(yHref).includes('Alpha Tile Works Llc') &&
    decodeURIComponent(yHref).includes('Seattle, WA'), yHref);
  check('outbound links open safely in a new tab',
    (await alphaLinks.nth(1).getAttribute('rel')).includes('noopener') &&
    (await alphaLinks.nth(1).getAttribute('target')) === '_blank', '');
  check('ampersands in business names are encoded, not broken',
    decodeURIComponent(await page.locator('.card', { hasText: 'Bravo Tile' })
      .locator('.extlink').nth(1).getAttribute('href')).includes('Bravo Tile & Stone Inc'), '');
  check('unverified links are labelled as a lookup, not a confirmed match',
    (await page.locator('.card', { hasText: 'Alpha Tile Works' })
      .locator('.extlinks__label').innerText()).toLowerCase().includes('look them up'), '');

  /* ------------------------------------------------------ review scores */  /* ------------------------------------------------------ review scores */

  check('sort control matches the default state',
    (await page.locator('#sortSelect').inputValue()) === 'name',
    await page.locator('#sortSelect').inputValue());

  check('unreviewed businesses say so instead of showing a fake score',
    (await page.locator('.rating--none').count()) > 0 &&
    (await page.locator('.rating--none').first().innerText()).includes('Not yet rated'), '');

  // Seed a local review and confirm it scores live on the directory.
  await page.evaluate(() => {
    const ratings = { workmanship: 5, communication: 5, schedule: 5, value: 5, conduct: 5, followup: 5 };
    localStorage.setItem('kcc-local-reviews-v1', JSON.stringify([{
      ubi: '600000001', businessName: 'ALPHA TILE WORKS LLC', trade: 'tile',
      ratings, jobSize: 'midsize', visitDate: '2026-08-01', evidence: 'named', _local: true
    }]));
  });
  await page.reload();
  await page.selectOption('#categorySelect', 'tile');
  await page.waitForSelector('.card', { timeout: 10000 });

  const alphaRated = page.locator('.card', { hasText: 'Alpha Tile Works' });
  const scoreTxt = await alphaRated.locator('.rating__score').innerText();
  const scoreNum = parseFloat(scoreTxt);
  check('a single 5-star review yields ~3.46, not 5.00 (shrinkage works end to end)',
    scoreNum > 3.3 && scoreNum < 3.6, scoreTxt);
  check('a single review is flagged provisional in the UI',
    (await alphaRated.locator('.rating__prov').count()) === 1, '');
  check('no award is granted off one review',
    (await alphaRated.locator('.award').count()) === 0, '');

  await alphaRated.locator('.rating__more summary').click();
  const breakdown = await alphaRated.locator('.axes').innerText();
  check('per-axis breakdown renders all six axes',
    SIX_AXES.every((a) => breakdown.includes(a)), breakdown);
  const transparency = await alphaRated.locator('.rating__more').innerText();
  check('the unadjusted average is disclosed alongside the adjusted score',
    transparency.includes('5.00'), transparency.slice(0, 160));

  // Sorting by score must put the rated business first.
  await page.selectOption('#sortSelect', 'score');
  await page.waitForTimeout(200);
  const firstName = await page.locator('.card__name').first().innerText();
  check('sorting by score ranks the rated business first',
    firstName.toLowerCase().includes('alpha'), firstName);

  await page.evaluate(() => localStorage.removeItem('kcc-local-reviews-v1'));

  /* ------------------------------------------------------- review.html */
  await page.goto(BASE + '/review.html?ubi=600000001&name=Alpha%20Tile%20Works');
  await page.waitForSelector('.starrow');
  check('review form renders one star row per axis',
    (await page.locator('.starrow').count()) === 6,
    'got ' + (await page.locator('.starrow').count()));
  check('review form prefills from the query string',
    (await page.locator('#ubi').inputValue()) === '600000001',
    await page.locator('#ubi').inputValue());
  const guide = await page.locator('.scaleguide').innerText();
  check('the form anchors the scale so 3 reads as a good outcome',
    guide.includes('3 means the contractor did what they promised'), guide.slice(0, 200));

  // Regression: keyboard activation used to record 3.5 when the user meant 4,
  // because half-star detection read pointer coordinates a keyboard never sends.
  const kbStar = page.locator('.starrow[data-axis="workmanship"] .star[data-i="4"]');
  await kbStar.focus();
  await page.keyboard.press('Enter');
  check('keyboard Enter records a WHOLE star, not a half',
    (await page.locator('.starrow[data-axis="workmanship"] .starrow__val').innerText()).trim() === '4.0',
    await page.locator('.starrow[data-axis="workmanship"] .starrow__val').innerText());

  await page.keyboard.press('ArrowLeft');
  check('arrow keys give keyboard users the half steps a mouse gets',
    (await page.locator('.starrow[data-axis="workmanship"] .starrow__val').innerText()).trim() === '3.5',
    await page.locator('.starrow[data-axis="workmanship"] .starrow__val').innerText());

  await page.keyboard.press('End');
  check('End jumps to the maximum',
    (await page.locator('.starrow[data-axis="workmanship"] .starrow__val').innerText()).trim() === '5.0', '');

  check('star buttons expose pressed state to assistive tech',
    (await page.locator('.starrow[data-axis="workmanship"] .star[data-i="5"]').getAttribute('aria-pressed')) === 'true', '');

  await page.keyboard.press('Delete');
  check('Delete clears an axis so it can be skipped',
    (await page.locator('.starrow[data-axis="workmanship"] .starrow__val').innerText()).trim() === 'skipped', '');

  // Rating one axis then submitting should save locally and emit a snippet.
  await page.locator('.starrow[data-axis="workmanship"] .star[data-i="4"]').click();
  await page.fill('#visitDate', '2026-07-01');
  await page.click('#reviewForm button[type=submit]');
  await page.waitForSelector('.snippet');
  const snippet = await page.locator('.snippet').innerText();
  check('local submission emits a commit-ready JSON snippet',
    snippet.includes('"ubi"') && snippet.includes('workmanship'), snippet.slice(0, 160));
  const notice = await page.locator('.notice').innerText();
  check('local submission is honest that nobody else can see it',
    notice.toLowerCase().includes('this browser and nowhere else'), notice.slice(0, 160));
  await page.evaluate(() => localStorage.removeItem('kcc-local-reviews-v1'));

  /* ------------------------------------------------------ rankings.html */
  await page.goto(BASE + '/rankings.html');
  await page.waitForSelector('#rankings');
  const rankTxt = await page.locator('#rankings').innerText();
  check('rankings page explains the empty state rather than faking data',
    rankTxt.includes('Nobody has written a review yet'), rankTxt.slice(0, 160));
  const rankBody = await page.locator('body').innerText();
  check('rankings page explains why scores look low',
    rankBody.includes('Why these numbers look low'), '');
  check('rankings page states awards are population-relative',
    rankBody.includes('top 1 percent'), '');

  /* ------------------------------------------------- certifications.html */
  await page.goto(BASE + '/certifications.html');
  await page.waitForSelector('.certtable');
  const tableCount = await page.locator('.certtable').count();
  const rowCount = await page.locator('.certtable tbody tr').count();
  check('certification guide renders grouped tables', tableCount >= 10, 'got ' + tableCount);
  check('certification guide lists every program',
    rowCount === Object.keys(await page.evaluate(() => CERT_PROGRAMS)).length,
    'rows ' + rowCount);
  const guideText = await page.locator('body').innerText();
  check('guide explains CTEF hands-on testing',
    guideText.includes('graded against the national standard'), '');

  /* ------------------------------------------------------------ about */
  await page.goto(BASE + '/about.html');
  await page.waitForSelector('.prose');
  const aboutText = await page.locator('body').innerText();
  check('about page states the ranking limitation honestly',
    aboutText.includes('will not turn state data into a quality ranking') &&
    aboutText.includes('not been reviewed here'), '');
  check('about page documents the scoring method',
    aboutText.includes('One five-star review gives about 3.46'), '');
  check('about page discloses the missing credibility weighting',
    aboutText.includes('reviewer credibility weighting'), '');

  /* ------------------------------------------------- house style guard */

  // Phrases and constructions that read as machine-written. Each was found in
  // an earlier draft of this site and deliberately removed; the test exists so
  // they do not creep back in.
  const BANNED = [
    'actually', 'basically', 'essentially', 'at the end of the day',
    "here's the thing", 'here is the thing', 'let me be clear',
    'in other words', 'worth noting', 'it is worth noting',
    'that said', 'needless to say', 'the whole point',
    'which is exactly why', 'which is precisely', 'the truth is',
    'it turns out', 'not just about', "isn't just about",
    'is not just about', 'when it comes to', 'in today',
    'delve', 'navigate the', 'a testament to', 'plays a role',
    'it should be noted', 'furthermore', 'moreover',
  ];

  const PAGES = ['index.html', 'about.html', 'certifications.html',
                 'rankings.html', 'review.html'];

  for (const pg of PAGES) {
    await page.goto(BASE + '/' + pg);
    await page.waitForSelector('body');
    const raw = await page.locator('body').innerText();
    const body = raw.toLowerCase();

    const hits = BANNED.filter((w) => body.includes(w));
    check('no stock phrases in ' + pg, hits.length === 0, hits.join(', '));

    // Em-dash asides were the other tell. A few are fine; a shower of them is
    // the machine's favourite way to fake a considered pause.
    const dashes = (raw.match(/—/g) || []).length;
    const per1k = (dashes / raw.length) * 1000;
    check('em-dashes stay sparse in ' + pg + ' (' + dashes + ')', per1k < 1.2,
      per1k.toFixed(2) + ' per 1000 chars');

    // "Not X, but Y" / "not X — Y" antithesis.
    const antithesis = raw.match(/\bnot [a-z][^.!?]{0,40}[,—][^.!?]{0,40}\bbut\b/gi) || [];
    check('no not-X-but-Y antithesis in ' + pg, antithesis.length === 0,
      antithesis.slice(0, 2).join(' | '));

    // Sentences should stay short and plain. Only prose is measured — form
    // labels and table cells have no sentence punctuation, so innerText on the
    // whole body would glue them into one enormous fake sentence.
    const prose = await page.$$eval(
      '.hero__lede, .section__sub, .prose p, .prose li, .steps li, .callout p, .scaleguide p, .site-foot p',
      (els) => els.map((e) => e.innerText));
    const longOnes = [];
    prose.forEach((block) => {
      block.split(/(?<=[.!?])\s+/).forEach((sent) => {
        const words = sent.trim().split(/\s+/).filter(Boolean);
        if (words.length > 34) longOnes.push(sent.trim());
      });
    });
    check('no runaway sentences in ' + pg, longOnes.length === 0,
      (longOnes[0] || '').slice(0, 140));

    // Average sentence length is the real readability lever.
    const allSents = prose.flatMap((b) => b.split(/(?<=[.!?])\s+/))
      .map((x) => x.trim().split(/\s+/).filter(Boolean).length)
      .filter((n) => n > 2);
    const avg = allSents.reduce((a, b) => a + b, 0) / (allSents.length || 1);
    check('prose averages under 20 words per sentence in ' + pg +
      ' (' + avg.toFixed(1) + ')', avg < 20, avg.toFixed(1));
  }

  /* ------------------------------------------------------------ report */
  await browser.close();

  let failed = 0;
  console.log('\n--- smoke test ---');
  results.forEach((r) => {
    if (!r.pass) failed++;
    console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.extra ? '\n         ' + r.extra.slice(0, 300) : ''));
  });
  if (errors.length) {
    console.log('\n--- js errors ---');
    errors.forEach((e) => console.log('  ' + e.slice(0, 300)));
  }
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed, ' +
    errors.length + ' js errors');
  process.exit(failed || errors.length ? 1 : 0);
})();
