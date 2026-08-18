/* ==========================================================================
   /numbers/  — the county figures
   --------------------------------------------------------------------------
   Charts follow the house rules: one series each, so no legend and no
   categorical-adjacency problem; bars capped at 24px with a 4px rounded
   data-end; a 2px surface gap doing the separating; values direct-labelled;
   grid recessive; and every chart backed by a real table for anyone (or
   anything) reading without CSS.
   ========================================================================== */

'use strict';

const R = require('./render');
const { esc, titleCase, fmtMoney, num, pct, slug } = require('./format');
const { SITE, BOND_GENERAL, BOND_SPECIALTY, BOND_CHANGED } = R;

function bars(rows, { max, unit = '', color = 'var(--brand)' }) {
  const top = max || Math.max(...rows.map((r) => r.value));
  return `<div class="chart">${rows.map((r) => `
    <div class="chart__row">
      <span class="chart__label">${esc(r.label)}</span>
      <span class="chart__track">
        <span class="chart__bar" style="width:${(r.value / top * 100).toFixed(2)}%;background:${color}"
              title="${esc(r.label)}: ${esc(r.display || (num(r.value) + unit))}"></span>
      </span>
      <span class="chart__value">${esc(r.display || (num(r.value) + unit))}</span>
    </div>`).join('')}</div>`;
}

function table(caption, head, rows) {
  return `<details class="datatable">
    <summary>See this as a table</summary>
    <table><caption>${esc(caption)}</caption>
      <thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) =>
        i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </details>`;
}

function numbersPage(stats) {
  const url = SITE + '/numbers/';
  const s = stats;

  const general = s.trades.find((t) => t.id === 'general');
  const others = s.trades.filter((t) => t.id !== 'general' && t.count > 0);
  const generalShare = general ? general.count / s.active * 100 : 0;
  const othersTotal = s.trades.filter((t) => t.id !== 'general').reduce((a, t) => a + t.count, 0);
  const generalDominates = general ? general.count > othersTotal : false;

  /* The headline has to follow the figure. Hard-coding "two out of three" was
     right for one week's data and would have quietly started lying the moment
     the mix shifted. */
  const generalHeadline =
    generalShare >= 62 ? 'Two out of three are general contractors'
    : generalShare >= 45 ? 'Almost half are general contractors'
    : generalShare >= 28 ? 'General contractors are the largest single trade'
    : 'How the trades divide up';

  const years = s.byYear.filter(([y]) => +y >= 2006 && +y <= new Date().getUTCFullYear());
  const yearMax = Math.max(...years.map(([, v]) => v));

  const coverage = s.trades
    .filter((t) => t.insuranceScope >= 25)
    .map((t) => ({ ...t, rate: t.insured / t.insuranceScope * 100 }))
    .sort((a, b) => b.rate - a.rate);

  const faq = [
    {
      q: 'Where do these numbers come from?',
      a: `<p>Three files Washington's Department of Labor &amp; Industries publishes as open
          data: the contractor registry, the bond file, and the insurance file. This page is
          rebuilt from them every week. No survey, no estimate, no scraping — the joins and
          the arithmetic are the only things we add.</p>`
    },
    {
      q: `Why does it say ${pct(s.noBondRowPct)} have no published bond instead of "unbonded"?`,
      a: `<p>Because the data does not support the stronger claim. The published bond file has
          no row at all for ${pct(s.noBondRowPct)} of active King County registrations, and that
          share sits between 40% and 48% for every licence cohort from 2010 to today. Real
          lapses would move around by year; a flat line across sixteen years describes the file.
          Washington also permits an assigned savings account in place of a surety bond, which
          would not appear in a bond file. So we report what is published and say no more.</p>`
    },
    {
      q: 'Why is insurance reported for only some trades?',
      a: `<p>The insurance file holds about 290 rows for electrical contractors statewide,
          against ${num(s.trades.find((t) => t.id === 'electrical')?.count || 0)} active electrical
          registrations in King County alone. A coverage rate computed on that would say
          something about the file, not about electricians. Insurance figures here cover
          construction and plumbing registrations, which the file does carry properly.</p>`
    },
    {
      q: 'Can I use these figures?',
      a: `<p>Yes, freely. They come from public records. A link back is appreciated and lets
          people check the working. Want a cut we do not publish? By city, by trade, by year?
          The source files are linked at the foot of every page. The join is three lines of
          SQL.</p>`
    }
  ];

  const body = `
<section class="hero hero--tight">
  <div class="wrap">
    ${R.breadcrumbNav([{ name: 'King County Contractors', url: SITE + '/' }, { name: 'The numbers', url }])}
    <h1>King County contracting, by the numbers</h1>
    <p class="hero__lede">
      Nobody publishes this. The state releases the raw files and leaves it there. These are
      the county's figures, rebuilt from those files every week, with the caveats stated
      plainly instead of buried.
    </p>
    <p class="hero__note">Built ${new Date(s.generatedAt).toDateString()} from <span class="mono">data.wa.gov</span>.</p>
  </div>
</section>

<section class="wrap section">
  <div class="tiles">
    <div class="tile">
      <span class="tile__n">${num(s.active)}</span>
      <span class="tile__label">Active registrations</span>
      <span class="tile__note">With a King County address</span>
    </div>
    <div class="tile">
      <span class="tile__n">${num(s.status.SUSPENDED || 0)}</span>
      <span class="tile__label">Currently suspended</span>
      <span class="tile__note">Still findable online, not allowed to work</span>
    </div>
    <div class="tile">
      <span class="tile__n">${pct(s.insuredPct)}</span>
      <span class="tile__label">Carry current insurance</span>
      <span class="tile__note">Of ${num(s.insuranceScope)} construction &amp; plumbing registrations</span>
    </div>
    <div class="tile">
      <span class="tile__n">${num(s.impairedInCounty)}</span>
      <span class="tile__label">Bonds paid against</span>
      <span class="tile__note">A claim was made and the surety paid</span>
    </div>
  </div>
</section>

<section class="wrap section">
  <h2 class="section__title">${esc(generalHeadline)}</h2>
  <p class="section__sub">
    ${general ? `${num(general.count)} of the county's ${num(s.active)} active registrations
    (${pct(generalShare)}) are general contractors.${generalDominates
      ? ` That one category is larger than all ${others.length} other trades combined, which
        is why it sits here rather than on the chart — on the same scale everything else
        would be a smudge.`
      : ` It is charted separately from the rest so the smaller trades stay readable.`}` : ''}
  </p>
  <h3 class="chart__title">Active registrations by trade, general contractors excluded</h3>
  ${bars(others.map((t) => ({ label: t.name, value: t.count })), {})}
  ${table('Active King County registrations by trade',
      ['Trade', 'Active', 'Bond published', 'Insurance published'],
      s.trades.map((t) => [t.name, num(t.count), num(t.bonded), t.insuranceScope ? num(t.insured) : '—']))}
</section>

<section class="wrap section">
  <h2 class="section__title">Who carries insurance</h2>
  <p class="section__sub">
    Share of construction and plumbing registrations with a current liability policy on file.
    Trades with fewer than 25 such registrations are left out — a rate on twelve businesses
    tells you nothing.
  </p>
  <h3 class="chart__title">Current liability insurance on file, by trade</h3>
  ${bars(coverage.map((t) => ({
      label: t.name, value: t.rate, display: pct(t.rate) + ' of ' + num(t.insuranceScope)
    })), { max: 100, color: 'var(--yes)' })}
  ${table('Insurance coverage by trade',
      ['Trade', 'In scope', 'Insured', 'Rate'],
      coverage.map((t) => [t.name, num(t.insuranceScope), num(t.insured), pct(t.rate, 1)]))}
</section>

<section class="wrap section">
  <h2 class="section__title">When today's contractors registered</h2>
  <p class="section__sub">
    Active registrations by the year they took effect. This is a picture of who is working
    now, not of how many registered each year — the ones who quit or lapsed are not here,
    which is why the recent years look busier.
  </p>
  <h3 class="chart__title">Active registrations by year of registration</h3>
  ${bars(years.map(([y, v]) => ({ label: y, value: v })), { max: yearMax })}
  ${table('Active registrations by effective year', ['Year', 'Active registrations'],
      years.map(([y, v]) => [y, num(v)]))}
</section>

<section class="wrap section">
  <div class="callout">
    <h2>What the bonds look like</h2>
    <p>
      Since ${BOND_CHANGED} the law asks ${fmtMoney(BOND_GENERAL)} of a general contractor and
      ${fmtMoney(BOND_SPECIALTY)} of a specialty contractor. Among King County registrations
      with a published bond, the median is ${fmtMoney(s.bondMedian)}, the middle half runs from
      ${fmtMoney(s.bondP25)} to ${fmtMoney(s.bondP75)}, and the largest is
      ${fmtMoney(s.bondMax)}. ${num(s.aboveMinimum)} contractors — ${pct(s.aboveMinimumPct)} of
      those with a bond on file — post more than the law requires.
    </p>
    <p>
      Work out what that covers on your own job with the
      <a href="${SITE}/bond-calculator/">bond calculator</a>.
    </p>
  </div>
</section>

${R.faqSection(faq)}
`;

  return {
    path: 'numbers/index.html',
    depth: 1,
    html: R.shell({
      title: 'King County contracting by the numbers — registrations, bonds, and insurance',
      /* Kept well clear of the 200-character ceiling. Six-figure counts are
         possible here, so the fixed text has to leave room for them. */
      description: `${num(s.active)} active contractor registrations in King County and ${num(s.status.SUSPENDED || 0)} suspended ones, plus what the state's bond and insurance files leave out. Rebuilt weekly.`,
      canonical: url,
      depth: 1,
      jsonld: [
        R.breadcrumbSchema([{ name: 'King County Contractors', url: SITE + '/' }, { name: 'The numbers', url }]),
        R.faqSchema(faq),
        {
          '@context': 'https://schema.org', '@type': 'Dataset',
          name: 'King County contractor registration, bond, and insurance figures',
          description: 'Weekly aggregate of Washington State L&I contractor registry, bond, and insurance files, scoped to King County.',
          url,
          license: 'https://creativecommons.org/publicdomain/zero/1.0/',
          isBasedOn: [
            'https://data.wa.gov/Labor/L-I-Contractor-License-Data-General/m8qx-ubtq',
            'https://data.wa.gov/Labor/L-I-Contractor-License-Data-Bond/bzff-4fmt',
            'https://data.wa.gov/Labor/L-I-Contractor-License-Data-Insurance/ciwg-agsx'
          ],
          dateModified: s.generatedAt.slice(0, 10),
          creator: { '@type': 'Organization', name: 'King County Contractor Directory' }
        }
      ],
      body
    })
  };
}

module.exports = { numbersPage, bars, table };
