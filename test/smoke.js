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

  /* ------------------------------------------------------ review scores */

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
    notice.toLowerCase().includes('this browser only'), notice.slice(0, 160));
  await page.evaluate(() => localStorage.removeItem('kcc-local-reviews-v1'));

  /* ------------------------------------------------------ rankings.html */
  await page.goto(BASE + '/rankings.html');
  await page.waitForSelector('#rankings');
  const rankTxt = await page.locator('#rankings').innerText();
  check('rankings page explains the empty state rather than faking data',
    rankTxt.includes('No reviews yet'), rankTxt.slice(0, 160));
  const rankBody = await page.locator('body').innerText();
  check('rankings page explains why scores look low',
    rankBody.includes('Why the numbers look low'), '');
  check('rankings page states awards are population-relative',
    rankBody.includes('top 1%'), '');

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
    guideText.includes('proctored test'), '');

  /* ------------------------------------------------------------ about */
  await page.goto(BASE + '/about.html');
  await page.waitForSelector('.prose');
  const aboutText = await page.locator('body').innerText();
  check('about page states the ranking limitation honestly',
    aboutText.includes('does not rank contractors using state data') &&
    aboutText.includes('just unreviewed here'), '');
  check('about page documents the scoring method',
    aboutText.includes('single five-star review produces roughly 3.46'), '');
  check('about page discloses the missing credibility weighting',
    aboutText.includes('reviewer credibility weighting is not'), '');

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
