/* ==========================================================================
   Trade and city landing pages
   --------------------------------------------------------------------------
   The FAQ on each page is built from that page's own figures, so no two pages
   answer with the same numbers. That is the difference between a set of real
   pages and one template with a place name swapped in.
   ========================================================================== */

'use strict';

const R = require('./render');
const { esc, titleCase, fmtMoney, slug, num } = require('./format');

const { SITE, BOND_GENERAL, BOND_SPECIALTY, BOND_CHANGED } = R;

const VERIFY = 'https://secure.lni.wa.gov/verify/';

/* ------------------------------------------------------------------- copy */

function commonFaq(records, label, place) {
  const n = records.length;
  const bonded = records.filter((r) => r.bond).length;
  const insured = records.filter((r) => r.insurance).length;
  const amounts = records.filter((r) => r.bond).map((r) => Number(r.bond.bondamt)).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const above = records.filter((r) => r.bond && Number(r.bond.bondamt) > BOND_SPECIALTY).length;
  const oldest = records.slice().sort((a, b) =>
    String(a.licenseeffectivedate).localeCompare(String(b.licenseeffectivedate)))[0];

  const items = [
    {
      q: `How many ${label.toLowerCase()} contractors are registered in ${place}?`,
      a: `<p>${num(n)}. That is every business the state currently lists with an active
          registration for this trade and a ${place === 'King County' ? 'King County' : place} address.
          The state confirms a current bond for ${num(bonded)} of them and current liability
          insurance for ${num(insured)}. The count changes as registrations are filed and
          lapse, and this page is rebuilt against the registry every week.</p>`
    },
    {
      q: 'What do licensed, bonded, and insured mean?',
      a: `<p><strong>Licensed</strong> means the business is registered with Washington's
          Department of Labor &amp; Industries. <strong>Bonded</strong> means a surety company
          has promised to pay up to a set amount if the contractor fails you and you win a
          claim. <strong>Insured</strong> means a liability policy is on file to cover damage
          they cause. Three separate things, and a contractor can have one without the others.</p>`
    },
    {
      q: 'How big is the bond?',
      a: `<p>Washington requires ${fmtMoney(BOND_GENERAL)} from a general contractor and
          ${fmtMoney(BOND_SPECIALTY)} from a specialty contractor. Those amounts rose on
          ${BOND_CHANGED}; before that they had been ${fmtMoney(12000)} and ${fmtMoney(6000)}
          for twenty-two years.
          ${median ? `The median bond among the ${label.toLowerCase()} contractors on this page is
          ${fmtMoney(median)}${above ? `, and ${num(above)} of them post more than the law asks` : ''}.` : ''}
          A contractor who posts more than required is worth a second look.</p>`
    },
    {
      q: 'Is the bond enough to cover my job?',
      a: `<p>Usually not. On a kitchen that costs $90,000, a ${fmtMoney(BOND_GENERAL)} bond covers
          a third of it. The bond is also shared: if several homeowners file claims against the
          same contractor, they line up against one pot of money, and lawyers and suppliers can
          be in that line too. Treat the bond as a floor, not as protection.
          Our <a href="${SITE}/bond-calculator/">bond calculator</a> shows the gap for your job.</p>`
    },
    {
      q: 'Does a license mean they do good work?',
      a: `<p>No, and this is the thing most people get wrong. Registration means the paperwork
          is filed and the bond is posted. Nobody from the state watched anyone build anything.
          It is a floor to stand on, not a mark of skill. For credentials that are graded by
          people who inspect the work, see the
          <a href="${SITE}/certifications.html">certification guide</a>.</p>`
    },
    {
      q: 'How do I check a contractor myself?',
      a: `<p>Go to <a href="${VERIFY}" target="_blank" rel="noopener">L&amp;I's verify tool</a>
          and search the business name or license number. Every listing on this page links
          straight to its record there. Do it the day you sign, not the day you read this —
          a registration can lapse in between. You can also use our
          <a href="${SITE}/verify/">one-box lookup</a>.</p>`
    }
  ];

  if (oldest && oldest.licenseeffectivedate) {
    items.push({
      q: `Which ${label.toLowerCase()} contractors have been registered the longest?`,
      a: `<p>The longest-standing active registration on this page belongs to
          ${esc(titleCase(oldest.businessname))}, registered since
          ${String(oldest.licenseeffectivedate).slice(0, 4)}. Sort the list by how long a
          business has been registered and you get a rough sense of who has been around.
          It is a weak signal on its own — a long registration says a company kept paying
          its fees, not that its work is good.</p>`
    });
  }

  return items;
}

function cityFaq(records, label, city) {
  return commonFaq(records, label, city).concat([
    {
      q: `Do these contractors only work in ${city}?`,
      a: `<p>No. The state records a mailing address, not a service area. A roofer with a
          ${city} address will drive across the county, and one two towns over may well
          take your job. Use the city as a starting point, not a boundary.</p>`
    }
  ]);
}


/* ----------------------------------------------------------------- pager */

/* Page 1 keeps the clean URL; later pages hang off /page/N/. Each page is its
   own canonical — telling search engines that page 4 is "really" page 1 is how
   listings on page 4 stop being indexed at all. */
function pageUrl(base, n) {
  return n <= 1 ? base : base + 'page/' + n + '/';
}

function pagePath(baseDir, n) {
  return n <= 1 ? baseDir + 'index.html' : baseDir + 'page/' + n + '/index.html';
}

function pager(base, page, pages, noun) {
  if (pages <= 1) return '';
  const around = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) around.push(i);
    else if (around[around.length - 1] !== '…') around.push('…');
  }
  return `<nav class="pager pager--static" aria-label="${esc(noun)} pages">
    ${page > 1 ? `<a class="btn btn--ghost" rel="prev" href="${pageUrl(base, page - 1)}">← Previous</a>`
               : '<span class="btn btn--ghost is-off">← Previous</span>'}
    <span class="pager__nums">${around.map((i) => i === '…'
      ? '<span class="pager__gap">…</span>'
      : i === page ? `<span class="pager__cur" aria-current="page">${i}</span>`
                   : `<a href="${pageUrl(base, i)}">${i}</a>`).join('')}</span>
    ${page < pages ? `<a class="btn btn--ghost" rel="next" href="${pageUrl(base, page + 1)}">Next →</a>`
                   : '<span class="btn btn--ghost is-off">Next →</span>'}
  </nav>`;
}

/* ------------------------------------------------------------------ pages */

function tradePage({ trade, records, all, page = 1, pages = 1, totalRecords, cities, stats }) {
  const total = totalRecords == null ? records.length : totalRecords;
  const base = `${SITE}/${trade.id}/`;
  const url = pageUrl(base, page);
  const pool = all || records;
  const bonded = pool.filter((r) => r.bond).length;
  const insured = pool.filter((r) => r.insurance).length;
  const faq = commonFaq(pool, trade.name, 'King County');
  const suffix = pages > 1 ? ` — page ${page} of ${pages}` : '';

  const trail = [
    { name: 'King County Contractors', url: SITE + '/' },
    { name: trade.name, url: base }
  ];
  if (page > 1) trail.push({ name: `Page ${page}`, url });

  const cityLinks = (cities || []).filter((c) => c.count >= 8).map((c) =>
    `<li><a href="${SITE}/${trade.id}/${slug(c.city)}/">${esc(titleCase(c.city))}</a>
     <span class="citylist__n">${num(c.count)}</span></li>`).join('');

  const body = `
<section class="hero hero--tight">
  <div class="wrap">
    ${R.breadcrumbNav(trail)}
    <h1>${esc(trade.name)} in King County</h1>
    <p class="hero__lede">
      ${num(total)} businesses hold an active Washington registration for this trade with a King
      County address. The state confirms a current bond for ${num(bonded)} of them and current
      liability insurance for ${num(insured)}. Every name below comes straight from the state
      registry, and every one links back to its record. Nobody pays to be listed here.
    </p>
    <p class="hero__note">Rebuilt from <span class="mono">data.wa.gov</span> on ${new Date(stats.generatedAt).toDateString()}.</p>
  </div>
</section>

${page === 1 && cityLinks ? `
<section class="wrap section">
  <h2 class="section__title">By city</h2>
  <ul class="citylist">${cityLinks}</ul>
</section>` : ''}

<section class="wrap section">
  <h2 class="section__title">
    ${pages > 1 ? `${esc(trade.name)}, ${num((page - 1) * 60 + 1)}–${num((page - 1) * 60 + records.length)} of ${num(total)}`
                : `Every registered ${esc(trade.name.toLowerCase())} business`}
  </h2>
  <div class="cards">${records.map(R.card).join('')}</div>
  ${pager(base, page, pages, trade.name)}
</section>

${page === 1 ? R.faqSection(faq) : ''}
`;

  return {
    path: pagePath(`${trade.id}/`, page),
    depth: page > 1 ? 3 : 1,
    html: R.shell({
      title: `${trade.name} in King County — Licensed, Bonded & Insured${suffix}`,
      description: `All ${num(total)} actively registered ${trade.name.toLowerCase()} businesses in King County, Washington, with licence, bond, and insurance status from the state registry${suffix}.`,
      canonical: url,
      depth: page > 1 ? 3 : 1,
      jsonld: [
        R.breadcrumbSchema(trail),
        R.itemListSchema(records, `${trade.name} in King County${suffix}`, url),
        page === 1 ? R.faqSchema(faq) : null
      ],
      body
    })
  };
}

function cityPage({ trade, city, records, page = 1, pages = 1, totalRecords, stats }) {
  const total = totalRecords == null ? records.length : totalRecords;
  const cityName = titleCase(city);
  const base = `${SITE}/${trade.id}/${slug(city)}/`;
  const url = pageUrl(base, page);
  const bonded = records.filter((r) => r.bond).length;
  const insured = records.filter((r) => r.insurance).length;
  const faq = cityFaq(records, trade.name, cityName);
  const suffix = pages > 1 ? ` — page ${page} of ${pages}` : '';

  const trail = [
    { name: 'King County Contractors', url: SITE + '/' },
    { name: trade.name, url: `${SITE}/${trade.id}/` },
    { name: cityName, url: base }
  ];
  if (page > 1) trail.push({ name: `Page ${page}`, url });

  const body = `
<section class="hero hero--tight">
  <div class="wrap">
    ${R.breadcrumbNav(trail)}
    <h1>${esc(trade.name)} in ${esc(cityName)}, WA</h1>
    <p class="hero__lede">
      ${num(total)} ${total === 1 ? 'business holds' : 'businesses hold'} an active Washington
      registration for this trade with a ${esc(cityName)} address. The address is where their
      mail goes, not the edge of where they will work.
    </p>
    <p class="hero__note">Rebuilt from <span class="mono">data.wa.gov</span> on ${new Date(stats.generatedAt).toDateString()}.</p>
  </div>
</section>

<section class="wrap section">
  <h2 class="section__title">
    ${pages > 1 ? `${esc(cityName)}, ${num((page - 1) * 60 + 1)}–${num((page - 1) * 60 + records.length)} of ${num(total)}`
                : `Registered ${esc(trade.name.toLowerCase())} businesses in ${esc(cityName)}`}
  </h2>
  <div class="cards">${records.map(R.card).join('')}</div>
  ${pager(base, page, pages, cityName)}
  <p class="section__sub">
    Looking wider? See <a href="${SITE}/${trade.id}/">every ${esc(trade.name.toLowerCase())}
    business in King County</a>.
  </p>
</section>

${page === 1 ? R.faqSection(faq) : ''}
`;

  return {
    path: pagePath(`${trade.id}/${slug(city)}/`, page),
    depth: page > 1 ? 4 : 2,
    html: R.shell({
      title: `${trade.name} in ${cityName}, WA — Licensed, Bonded & Insured${suffix}`,
      description: `${num(total)} actively registered ${trade.name.toLowerCase()} businesses with a ${cityName}, Washington address, each checked against the state registry for licence, bond, and insurance${suffix}.`,
      canonical: url,
      depth: page > 1 ? 4 : 2,
      jsonld: [
        R.breadcrumbSchema(trail),
        R.itemListSchema(records, `${trade.name} in ${cityName}, WA${suffix}`, url),
        page === 1 ? R.faqSchema(faq) : null
      ],
      body
    })
  };
}

module.exports = { tradePage, cityPage, commonFaq, cityFaq, pageUrl, pagePath, pager };
