/* ==========================================================================
   HTML templates for the pre-rendered pages
   --------------------------------------------------------------------------
   Every page emitted here contains its listings as real markup. The live
   lookup still runs on top for freshness, but a crawler that executes no
   JavaScript sees the full list, the counts, and the answers.
   ========================================================================== */

'use strict';

const { esc, titleCase, fmtDate, fmtMoney, fmtPhone, slug, num } = require('./format');

const SITE = 'https://nichkt.github.io/SeattleContractorList';
const BOND_GENERAL = 30000;
const BOND_SPECIALTY = 15000;
const BOND_CHANGED = 'July 1, 2024';

const up = (depth) => depth === 0 ? '' : '../'.repeat(depth);

/* ------------------------------------------------------------------ shell */

function shell({ title, description, canonical, depth = 0, jsonld = [], body, bodyClass = '' }) {
  const r = up(depth);
  const blocks = jsonld.filter(Boolean)
    .map((o) => '<script type="application/ld+json">\n' + JSON.stringify(o, null, 2) + '\n</script>')
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0f766e">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://data.wa.gov">
<link rel="stylesheet" href="${r}assets/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛠️</text></svg>">
${blocks}
</head>
<body${bodyClass ? ' class="' + bodyClass + '"' : ''}>

<svg class="sprite" aria-hidden="true" focusable="false"><defs>
<symbol id="i-yes" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></symbol>
<symbol id="i-no" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
</defs></svg>

<a class="skip" href="#main">Skip to content</a>

<header class="site">
  <div class="wrap site__inner">
    <a class="brand" href="${r || './'}">
      <svg viewBox="0 0 24 24" aria-hidden="true" class="brand__mark">
        <path d="M3 21h18M5 21V9l7-6 7 6v12M9.5 21v-6h5v6"/>
      </svg>
      <span>
        <strong>King County Contractors</strong>
        <em>Licensed · Bonded · Insured</em>
      </span>
    </a>
    <nav class="site__nav">
      <a href="${r}verify/">Check a contractor</a>
      <a href="${r}bond-calculator/">Bond calculator</a>
      <a href="${r}numbers/">The numbers</a>
      <a href="${r}certifications.html">Certifications</a>
      <a href="${r}about.html">How this works</a>
      <button id="themeToggle" class="iconbtn" aria-label="Toggle dark mode" title="Toggle dark mode">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>
      </button>
    </nav>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="site-foot">
  <div class="wrap">
    <p>
      <strong>We are not the government and do not speak for it.</strong> This is an
      independent site built on public records. It is not affiliated with Washington State
      L&amp;I or King County. Every listing comes straight from the state registry. A
      listing here is not a recommendation. It means the paperwork is in order.
    </p>
    <p class="muted small">
      Data: <a href="https://data.wa.gov/Labor/L-I-Contractor-License-Data-General/m8qx-ubtq" target="_blank" rel="noopener">L&amp;I Contractor License Data — General</a>,
      <a href="https://data.wa.gov/Labor/L-I-Contractor-License-Data-Bond/bzff-4fmt" target="_blank" rel="noopener">Bond</a>, and
      <a href="https://data.wa.gov/Labor/L-I-Contractor-License-Data-Insurance/ciwg-agsx" target="_blank" rel="noopener">Insurance</a>,
      published by the Washington State Department of Labor &amp; Industries.
      Check any contractor yourself at <a href="https://secure.lni.wa.gov/verify/" target="_blank" rel="noopener">secure.lni.wa.gov/verify</a>.
      &copy; <span id="year">${new Date().getFullYear()}</span>.
    </p>
  </div>
</footer>

<script src="${r}assets/theme.js"></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------- card */

function statusPill(ok, label, detail) {
  return `<span class="pill ${ok ? 'pill--yes' : 'pill--no'}" title="${esc(detail)}">` +
    `<svg aria-hidden="true"><use href="#${ok ? 'i-yes' : 'i-no'}"/></svg>${esc(label)}</span>`;
}

function card(rec) {
  const b = rec.bond, i = rec.insurance;
  const name = titleCase(rec.businessname);
  const cityName = titleCase(rec.city);
  const addr = [titleCase(rec.address1), cityName, 'WA', rec.zip].filter(Boolean).join(', ');
  const scope = encodeURIComponent(name + ' ' + cityName + ' WA');
  const lni = 'https://secure.lni.wa.gov/verify/Detail.aspx?UBI=' +
    encodeURIComponent(rec.ubi || '') + '&LIC=' + encodeURIComponent(rec.contractorlicensenumber || '');

  return `
  <article class="card" data-lic="${esc(rec.contractorlicensenumber)}">
    <header class="card__head">
      <h3 class="card__name">${esc(name)}</h3>
      <div class="card__status">
        ${statusPill(true, 'Licensed', 'Active registration through ' + fmtDate(rec.licenseexpirationdate))}
        ${statusPill(!!b, 'Bonded', b ? b.bondfirmname + ' — ' + fmtMoney(b.bondamt) : 'No current bond published for this licence')}
        ${statusPill(!!i, 'Insured', i ? i.insurancecompany + ' — ' + fmtMoney(i.insuranceamt) : 'No current policy published for this licence')}
      </div>
    </header>
    ${rec.impairedBond ? `<p class="flag flag--warn">A claim has been paid against this contractor's bond${
      rec.impairedBond.bondimpaireddate ? ' (' + fmtDate(rec.impairedBond.bondimpaireddate) + ')' : ''
    }. Ask them about it.</p>` : ''}

    <div class="extlinks">
      <span class="extlinks__label">Look them up</span>
      <a class="extlink" href="https://www.google.com/search?q=${scope}" target="_blank" rel="noopener noreferrer">Find site</a>
      <a class="extlink" href="https://www.google.com/maps/search/?api=1&amp;query=${scope}" target="_blank" rel="noopener noreferrer">Google</a>
      <a class="extlink" href="https://www.yelp.com/search?find_desc=${encodeURIComponent(name)}&amp;find_loc=${encodeURIComponent(cityName + ', WA')}" target="_blank" rel="noopener noreferrer">Yelp</a>
    </div>

    <dl class="card__meta">
      <div><dt>Specialty</dt><dd>${esc(titleCase(rec.specialtycode1desc || 'General'))}</dd></div>
      <div><dt>License #</dt><dd class="mono">${esc(rec.contractorlicensenumber)}</dd></div>
      <div><dt>Registered since</dt><dd>${fmtDate(rec.licenseeffectivedate)}</dd></div>
      <div><dt>Business type</dt><dd>${esc(rec.businesstypecodedesc || '—')}</dd></div>
    </dl>

    <div class="card__contact">
      ${rec.phonenumber ? `<a class="btn btn--ghost" href="tel:${esc(String(rec.phonenumber).replace(/\D/g, ''))}">${esc(fmtPhone(rec.phonenumber))}</a>` : ''}
      <span class="card__addr">${esc(addr)}</span>
    </div>

    <details class="card__more">
      <summary>Bond &amp; insurance</summary>
      <div class="detail-grid">
        <div>
          <h4>The bond</h4>
          ${b ? `<p>${esc(b.bondfirmname || '—')}<br>Amount ${fmtMoney(b.bondamt)}<br>
                 Effective ${fmtDate(b.bondeffectivedate)}<br>Expires ${fmtDate(b.bondexpirationdate)}</p>`
              : '<p class="muted">The state publishes no current bond for this licence. ' +
                'That is not the same as being unbonded — see <a href="' + SITE +
                '/about.html">how this works</a>.</p>'}
        </div>
        <div>
          <h4>The insurance</h4>
          ${i ? `<p>${esc(i.insurancecompany || '—')}<br>Coverage ${fmtMoney(i.insuranceamt)}<br>
                 Expires ${fmtDate(i.expirationdate)}</p>`
              : '<p class="muted">The state publishes no current policy for this licence.</p>'}
        </div>
      </div>
      ${rec.primaryprincipalname ? `<p class="muted">Principal: ${esc(titleCase(rec.primaryprincipalname))}</p>` : ''}
      <a class="btn btn--primary" href="${esc(lni)}" target="_blank" rel="noopener">Check it on L&amp;I →</a>
    </details>
  </article>`;
}

/* -------------------------------------------------------------------- faq */

function faqSection(items) {
  return `
<section class="wrap section">
  <h2 class="section__title">Questions people ask</h2>
  <div class="faq">
    ${items.map((q) => `
    <details class="faq__item">
      <summary>${esc(q.q)}</summary>
      <div class="faq__a">${q.a}</div>
    </details>`).join('')}
  </div>
</section>`;
}

function faqSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
    }))
  };
}

/* ----------------------------------------------------------------- schema */

function breadcrumbSchema(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, n) => ({
      '@type': 'ListItem', position: n + 1, name: t.name, item: t.url
    }))
  };
}

function itemListSchema(records, name, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    numberOfItems: records.length,
    itemListElement: records.slice(0, 100).map((r, n) => ({
      '@type': 'ListItem',
      position: n + 1,
      item: {
        '@type': 'LocalBusiness',
        name: titleCase(r.businessname),
        address: {
          '@type': 'PostalAddress',
          streetAddress: titleCase(r.address1 || '') || undefined,
          addressLocality: titleCase(r.city),
          addressRegion: 'WA',
          postalCode: r.zip || undefined,
          addressCountry: 'US'
        },
        telephone: r.phonenumber ? fmtPhone(r.phonenumber) : undefined,
        identifier: r.contractorlicensenumber
      }
    }))
  };
}

function breadcrumbNav(trail) {
  return `<nav class="crumbs" aria-label="Breadcrumb">` +
    trail.map((t, n) => n === trail.length - 1
      ? `<span aria-current="page">${esc(t.name)}</span>`
      : `<a href="${esc(t.url)}">${esc(t.name)}</a>`
    ).join('<span class="crumbs__sep">/</span>') + `</nav>`;
}

/* Template literals indent generously, which is right for reading the source
   and wrong for shipping 300 listings. This squeezes whitespace that sits
   between tags and leaves whitespace inside text alone, so nothing that a
   reader sees changes. Worth roughly a third of the bytes on a listing page. */
function squeeze(html) {
  const parts = html.split(/(<(?:script|style|pre|textarea)\b[\s\S]*?<\/(?:script|style|pre|textarea)>)/i);
  return parts.map((part, i) => i % 2
    ? part
    : part.replace(/>\s*\n\s*</g, '><').replace(/\n{2,}/g, '\n')
  ).join('');
}

module.exports = {
  SITE, BOND_GENERAL, BOND_SPECIALTY, BOND_CHANGED, squeeze,
  shell, card, statusPill, faqSection, faqSchema,
  breadcrumbSchema, itemListSchema, breadcrumbNav, up
};
