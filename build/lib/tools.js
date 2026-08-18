/* ==========================================================================
   The four standalone pages
     /verify/           one box, one answer — is this contractor covered
     /bond-calculator/  what the bond covers on your job, and what it does not
     /numbers/          county figures, rebuilt weekly
     /report/2026/      the annual write-up
   ========================================================================== */

'use strict';

const R = require('./render');
const { esc, titleCase, fmtMoney, num, pct, slug } = require('./format');
const { SITE, BOND_GENERAL, BOND_SPECIALTY, BOND_CHANGED } = R;

/* ----------------------------------------------------------------- verify */

function verifyPage(stats) {
  const url = SITE + '/verify/';
  const faq = [
    {
      q: 'What does this check?',
      a: `<p>Three things, straight from Washington's Department of Labor &amp; Industries:
          whether the registration is active, whether a current surety bond is on file, and
          whether current liability insurance is on file. It reads the state's own published
          data at the moment you press the button. Nothing is cached.</p>`
    },
    {
      q: 'It says no current bond. Are they unbonded?',
      a: `<p>Not necessarily, and this matters. The published bond file does not carry a row
          for every active registration. About ${pct(stats.noBondRowPct)} of King County's
          active registrations have no bond row at all. That share is flat for every year back
          to 2010, which points at the file rather than at the contractors. Washington also
          lets a contractor file an assigned savings account in place of a surety bond, and
          that would not show up here. Treat a blank as a question to ask them.</p>`
    },
    {
      q: 'Can I search by license number?',
      a: `<p>Yes. Business name, license number, or UBI all work. License numbers are the most
          reliable, because contractor names collide constantly — there are several businesses in
          this county with nearly the same name.</p>`
    },
    {
      q: 'Why does the state say something different?',
      a: `<p>It should not, but if it does, believe the state. This reads the same records L&amp;I
          publishes, and every result links straight to the official page. If the two disagree,
          the official page is the one that counts.</p>`
    }
  ];

  const body = `
<section class="hero hero--tight">
  <div class="wrap">
    ${R.breadcrumbNav([{ name: 'King County Contractors', url: SITE + '/' }, { name: 'Check a contractor', url }])}
    <h1>Check a contractor</h1>
    <p class="hero__lede">
      Type a business name, license number, or UBI. We ask the state and tell you what it says:
      registration, bond, insurance. It takes a second and it is free. Do it before you sign,
      not after.
    </p>
  </div>
</section>

<section class="wrap section">
  <form class="lookup" id="lookupForm" role="search">
    <label class="field field--grow">
      <span class="field__label">Business name, license number, or UBI</span>
      <input type="search" id="lookupInput" placeholder="Cornerstone Metal Roofing, or CORNEMR790DJ"
             autocomplete="off" required>
    </label>
    <button class="btn btn--primary" type="submit">Check</button>
  </form>
  <p class="section__sub">Searches all of Washington, not just King County.</p>

  <div class="status" id="lookupStatus" role="status" aria-live="polite"></div>
  <div class="cards" id="lookupResults"></div>
</section>

${R.faqSection(faq)}
`;

  return {
    path: 'verify/index.html',
    depth: 1,
    html: R.shell({
      title: 'Check a contractor — license, bond, and insurance in Washington State',
      description: 'Type a contractor’s name or license number and see what Washington State L&I says about their registration, surety bond, and liability insurance. Free, live, no sign-up.',
      canonical: url,
      depth: 1,
      jsonld: [
        R.breadcrumbSchema([{ name: 'King County Contractors', url: SITE + '/' }, { name: 'Check a contractor', url }]),
        R.faqSchema(faq),
        {
          '@context': 'https://schema.org', '@type': 'WebApplication',
          name: 'Washington Contractor Check', url,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
        }
      ],
      body
    }).replace('</body>', '<script src="../assets/verify.js"></script>\n</body>')
  };
}

/* ------------------------------------------------------- bond calculator */

function bondCalculatorPage(stats) {
  const url = SITE + '/bond-calculator/';
  const faq = [
    {
      q: `Why did the bond amounts change on ${BOND_CHANGED}?`,
      a: `<p>The legislature raised them for the first time in twenty-two years. A general
          contractor's bond went from ${fmtMoney(12000)} to ${fmtMoney(BOND_GENERAL)} and a
          specialty contractor's from ${fmtMoney(6000)} to ${fmtMoney(BOND_SPECIALTY)}. The old
          figures had not moved since 2002, and construction costs had.</p>`
    },
    {
      q: 'Do I get the whole bond if something goes wrong?',
      a: `<p>Rarely. You have to win a judgment first, and you are in line with everyone else
          who has a claim against the same bond — other homeowners, suppliers, and in some cases
          the state. If the claims add up to more than the bond, everyone takes a share. The
          bond is a floor, not a guarantee.</p>`
    },
    {
      q: 'How do I get more protection than the bond?',
      a: `<p>Pay in stages tied to work you can see finished. Keep a retainage until the job
          is signed off. Get the insurance certificate from the carrier, not the contractor, and
          ask them to name your job on it. On a big job, ask about a performance bond written
          for that project — that is a different instrument from the registration bond and it is
          sized to the work.</p>`
    },
    {
      q: 'What do contractors post in practice?',
      a: `<p>Among King County's actively registered contractors with a published bond, the
          median is ${fmtMoney(stats.bondMedian)}, and ${num(stats.aboveMinimum)}
          (${pct(stats.aboveMinimumPct)}) post more than the law requires. The largest bond on
          file in the county is ${fmtMoney(stats.bondMax)}. A contractor carrying more than the
          minimum is telling you something.</p>`
    }
  ];

  const body = `
<section class="hero hero--tight">
  <div class="wrap">
    ${R.breadcrumbNav([{ name: 'King County Contractors', url: SITE + '/' }, { name: 'Bond calculator', url }])}
    <h1>What the bond really covers</h1>
    <p class="hero__lede">
      Washington asks a general contractor for ${fmtMoney(BOND_GENERAL)} and a specialty
      contractor for ${fmtMoney(BOND_SPECIALTY)}. People hear "bonded" and picture their whole
      job protected. Put your numbers in and see the gap.
    </p>
  </div>
</section>

<section class="wrap section">
  <div class="calc">
    <div class="calc__inputs">
      <label class="field">
        <span class="field__label">What the job costs</span>
        <input type="number" id="jobCost" value="90000" min="0" step="1000" inputmode="numeric">
      </label>
      <label class="field">
        <span class="field__label">Kind of contractor</span>
        <select id="contractorKind">
          <option value="${BOND_GENERAL}">General — ${fmtMoney(BOND_GENERAL)} bond</option>
          <option value="${BOND_SPECIALTY}">Specialty — ${fmtMoney(BOND_SPECIALTY)} bond</option>
        </select>
      </label>
      <label class="field">
        <span class="field__label">Bond they posted, if you know it (optional)</span>
        <input type="number" id="actualBond" placeholder="leave blank for the legal minimum" min="0" step="1000" inputmode="numeric">
      </label>
      <label class="field">
        <span class="field__label">Others likely claiming against the same bond</span>
        <input type="number" id="claimants" value="1" min="1" max="50" step="1" inputmode="numeric">
      </label>
    </div>

    <div class="calc__out" id="calcOut" aria-live="polite"></div>
  </div>

  <div class="callout">
    <h2>What to do about the gap</h2>
    <ol class="steps">
      <li><strong>Pay for work you can see.</strong> Tie each payment to a stage that is finished, not to a date on a calendar.</li>
      <li><strong>Hold a retainage.</strong> Keep a slice back until the job is signed off and the punch list is done.</li>
      <li><strong>Get the certificate from the carrier.</strong> Ask the insurer directly, and ask them to name your job.</li>
      <li><strong>On a big job, ask about a performance bond.</strong> Written for your project and sized to it. Different from the registration bond entirely.</li>
      <li><strong>Check the registration the day you sign.</strong> Not the day you shortlisted them. <a href="${SITE}/verify/">One box, one answer</a>.</li>
    </ol>
  </div>
</section>

${R.faqSection(faq)}
`;

  return {
    path: 'bond-calculator/index.html',
    depth: 1,
    html: R.shell({
      title: 'Contractor bond calculator — what a Washington bond covers',
      description: `Washington requires a ${fmtMoney(BOND_GENERAL)} bond from general contractors and ${fmtMoney(BOND_SPECIALTY)} from specialty contractors. See how far that goes on your job, and what to do about the gap.`,
      canonical: url,
      depth: 1,
      jsonld: [
        R.breadcrumbSchema([{ name: 'King County Contractors', url: SITE + '/' }, { name: 'Bond calculator', url }]),
        R.faqSchema(faq)
      ],
      body
    }).replace('</body>', '<script src="../assets/bond-calculator.js"></script>\n</body>')
  };
}

module.exports = { verifyPage, bondCalculatorPage };
