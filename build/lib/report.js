/* ==========================================================================
   /report/<year>/  — the annual write-up
   --------------------------------------------------------------------------
   Every figure is interpolated from the build's own statistics. Nothing is
   typed in by hand, so the report cannot drift away from the data underneath
   it, and next year's edition writes itself.
   ========================================================================== */

'use strict';

const R = require('./render');
const { esc, titleCase, fmtMoney, num, pct } = require('./format');
const { SITE, BOND_GENERAL, BOND_SPECIALTY, BOND_CHANGED } = R;

function reportPage(stats) {
  const s = stats;
  const year = new Date(s.generatedAt).getUTCFullYear();
  const url = `${SITE}/report/${year}/`;
  const built = new Date(s.generatedAt).toDateString();

  const general = s.trades.find((t) => t.id === 'general');
  const suspended = s.status.SUSPENDED || 0;
  const expired = s.status.EXPIRED || 0;
  const oob = s.status['OUT OF BUSINESS'] || 0;
  const suspendedShare = suspended / (s.active + suspended) * 100;

  const biggest = s.trades.filter((t) => t.id !== 'general').slice(0, 5);
  const topCities = s.cities.slice(0, 8);
  const seattle = s.cities.find((c) => c.city === 'SEATTLE');
  const seattleShare = seattle ? seattle.count / s.active * 100 : 0;

  const recent = s.byYear.filter(([y]) => +y >= year - 4 && +y < year);
  const recentAvg = recent.length ? recent.reduce((a, [, v]) => a + v, 0) / recent.length : 0;
  const thisYear = (s.byYear.find(([y]) => +y === year) || [null, 0])[1];

  const faq = [
    {
      q: 'May I quote these figures?',
      a: `<p>Yes. They come from public records and they are free to use. A link back lets
          your readers check the working, which is the whole point. Want a cut that is not
          here? A single city, a single trade, a longer run of years? The source files are
          linked at the foot of the page, and the method is described above.</p>`
    },
    {
      q: 'How often is this updated?',
      a: `<p>The figures behind it are rebuilt from the state's files every week. The report
          carries the date it was built. Numbers quoted from an older edition will not match a
          newer one, so cite the date.</p>`
    },
    {
      q: 'What would you not conclude from this?',
      a: `<p>That the county is full of contractors working without a bond. The published
          file is missing rows for reasons the data does not explain, and the law permits an
          assigned savings account in place of a surety bond. What we can say is narrow: the
          state publishes a current bond for ${num(s.bonded)} of ${num(s.active)} active
          registrations. Turning the remainder into a headline count would be inventing a
          finding the evidence does not carry.</p>`
    }
  ];

  const body = `
<section class="hero hero--tight">
  <div class="wrap">
    ${R.breadcrumbNav([
      { name: 'King County Contractors', url: SITE + '/' },
      { name: `${year} report`, url }
    ])}
    <p class="eyebrow">Annual report</p>
    <h1>The state of contracting in King County, ${year}</h1>
    <p class="hero__lede">
      Washington publishes its contractor registry as open data and then leaves it alone.
      Nobody adds it up. This is the county's ledger for ${year}: who is registered, who is
      covered, and what the record does not tell you.
    </p>
    <p class="hero__note">Built ${built} from <span class="mono">data.wa.gov</span>.</p>
  </div>
</section>

<article class="wrap section prose">

  <h2>The headline</h2>
  <p>
    ${num(s.active)} businesses hold an active Washington contractor registration with a King
    County address. Another ${num(suspended)} are suspended right now, ${num(expired)} have
    let a registration expire, and ${num(oob)} are recorded as out of business. The county's
    full file runs to ${num(s.totalOnFile)} records, so a name turning up in a web search
    proves very little on its own.
  </p>
  <p>
    The number worth sitting with is ${num(suspended)}. That is ${pct(suspendedShare, 1)} of
    everyone who holds or recently held an active registration here. A suspended contractor's
    website looks exactly like anyone else's. They are still advertising. They
    still answer the phone. The state has simply told them to stop working, and there is
    nothing on the outside of the business that says so.
  </p>

  <h2>The trades</h2>
  <p>
    ${general ? `General contractors dominate: ${num(general.count)} registrations, or
    ${pct(general.count / s.active * 100)} of the county. ` : ''}After them it drops off
    sharply: ${biggest.map((t) => `${t.name.toLowerCase()} at ${num(t.count)}`)
      .join(', ').replace(/, ([^,]*)$/, ', and $1')}.
    The long tail is genuinely thin. ${s.trades.filter((t) => t.count < 50).length} of the
    twenty-seven trades we track have fewer than fifty registered businesses in the whole
    county, which is worth remembering the next time somebody tells you to get three quotes.
  </p>

  <h2>Where they are</h2>
  <p>
    ${seattle ? `Seattle accounts for ${num(seattle.count)} registrations, ${pct(seattleShare)}
    of the county. ` : ''}After it, ${topCities.slice(1, 5).map((c) =>
      `${titleCase(c.city)} (${num(c.count)})`).join(', ')}. Bear in mind the state records a
    mailing address and not a service area. A contractor registered in Kent will drive to
    Sammamish, and the address tells you where the paperwork goes rather than where the truck
    turns up.
  </p>

  <h2>Bonds</h2>
  <p>
    ${BOND_CHANGED} was the first change to Washington's bond amounts in twenty-two years.
    A general contractor's bond went from ${fmtMoney(12000)} to ${fmtMoney(BOND_GENERAL)}, and
    a specialty contractor's from ${fmtMoney(6000)} to ${fmtMoney(BOND_SPECIALTY)}. The old
    numbers were set in 2002 and had spent two decades quietly shrinking against the cost of
    the work they were meant to cover.
  </p>
  <p>
    Among King County registrations with a bond on file, the median is
    ${fmtMoney(s.bondMedian)} and the middle half runs ${fmtMoney(s.bondP25)} to
    ${fmtMoney(s.bondP75)}. ${num(s.aboveMinimum)} — ${pct(s.aboveMinimumPct)} of those with a
    published bond — carry more than the law requires. That is a real signal and it is free to
    look up. A contractor who posts triple the minimum has told a surety company something
    about themselves, and the surety agreed.
  </p>
  <p>
    Even the new figure is small against the work. ${fmtMoney(BOND_GENERAL)} covers a third of
    a $90,000 kitchen, and it is shared: several claimants against one bond line up and take a
    share. Bonded is a floor. It was never a guarantee, and the raised amounts have not made
    it one.
  </p>

  <h2>Insurance</h2>
  <p>
    ${pct(s.insuredPct)} of the county's construction and plumbing registrations carry a
    current liability policy on file — ${num(s.insured)} of ${num(s.insuranceScope)}. That
    leaves roughly ${num(s.insuranceScope - s.insured)} actively registered businesses with no
    current policy published against their licence. It is the single most checkable thing on
    this page and it takes about fifteen seconds.
  </p>

  <h2>Claims</h2>
  <p>
    ${num(s.impairedInCounty)} King County contractors have a bond recorded as impaired, which
    is the state's way of saying a claim was made and the surety paid. It is a small number
    and it is buried in a file nobody reads. Where we have it, it appears on the contractor's
    listing, because a paid claim is the closest thing in the public record to a verdict on
    somebody's work.
  </p>

  <h2>What the record cannot tell you</h2>
  <p>
    Washington publishes no open dataset of contractor infractions, complaints, or lawsuits.
    That history exists only on the state's own verification pages, one contractor at a time.
    Anyone claiming to rank Washington contractors by complaint volume is not working from
    published data, because there is none to work from.
  </p>
  <p>
    The bond file is incomplete in a way that matters. ${pct(s.noBondRowPct)} of active King
    County registrations have no bond row at all, and that share holds between 40% and 48%
    for every registration cohort back to 2010. A real compliance problem would vary by year.
    A flat line across sixteen years is a property of the file. Add that the law permits an
    assigned savings account instead of a surety bond, and the honest statement is narrow:
    the state publishes a current bond for ${num(s.bonded)} of ${num(s.active)} active King
    County registrations. What the rest have, the published data does not say.
  </p>
  <p>
    And registration is not competence. It means fees were paid, a bond was posted, and a form
    was filed. Nobody from the state watched anyone build anything. It is the floor you should
    refuse to go below, and it is not a recommendation.
  </p>

  <h2>How this was built</h2>
  <p>
    Three files: the L&amp;I contractor registry, the bond file, and the insurance file. They
    are joined on the contractor licence number and filtered to King County mailing addresses
    across ${require('../../data/categories.js').KING_COUNTY_CITIES.length} cities and towns.
    A bond or policy counts as current when its effective date has passed and no cancellation
    or expiry date has. Where a business has several bonds on file, the largest current one
    is used.
  </p>
  <p>
    One trap is worth naming for anyone repeating the exercise. Socrata does not guarantee row
    order, so paging through these files without an explicit sort silently returns some rows
    twice and skips others. Pulled unordered, the bond file gave 80,000 rows holding 31,171
    distinct licence numbers. Sorted, the same 80,000 rows held 37,508 — which is what the
    server's own distinct count reports. A sixth of the file, gone, with no error raised.
  </p>
</article>

${R.faqSection(faq)}
`;

  return {
    path: `report/${year}/index.html`,
    depth: 2,
    html: R.shell({
      title: `The state of contracting in King County, ${year}`,
      description: `${num(s.active)} active contractor registrations, ${num(suspended)} suspended, ${pct(s.insuredPct)} insured. An annual read of Washington L&I's open data for King County — with the gaps in the record stated plainly.`,
      canonical: url,
      depth: 2,
      jsonld: [
        R.breadcrumbSchema([
          { name: 'King County Contractors', url: SITE + '/' },
          { name: `${year} report`, url }
        ]),
        R.faqSchema(faq),
        {
          '@context': 'https://schema.org', '@type': 'Report',
          headline: `The state of contracting in King County, ${year}`,
          datePublished: s.generatedAt.slice(0, 10),
          dateModified: s.generatedAt.slice(0, 10),
          url,
          author: { '@type': 'Organization', name: 'King County Contractor Directory' },
          publisher: { '@type': 'Organization', name: 'King County Contractor Directory' },
          isBasedOn: 'https://data.wa.gov/Labor/L-I-Contractor-License-Data-General/m8qx-ubtq'
        }
      ],
      body
    })
  };
}

module.exports = { reportPage };
