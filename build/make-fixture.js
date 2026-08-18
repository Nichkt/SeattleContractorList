#!/usr/bin/env node
/* ==========================================================================
   Generate the offline test fixture
     node build/make-fixture.js [outfile]

   The fixture mirrors the live schema including the parts that have caused
   bugs: a text expiry column carrying "Until Canceled" rather than a date,
   licences with no bond row, cancelled bonds that must not read as current,
   an impaired bond, electrical registrations largely absent from the
   insurance file, and names with apostrophes and initialisms.

   Deterministic, so a fixture built today matches one built next year and a
   test failure means the code changed rather than the dice.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const { CATEGORIES, KING_COUNTY_CITIES } = require('../data/categories.js');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'test', 'fixtures', 'li.json'));

let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const SURETY = ['Western Surety Co', 'Nationwide Mutual Ins Co', 'American Contractors Indem CO', 'Merchants Bonding Co'];
const CARRIER = ['State Farm Fire and Casualty', 'Acuity A Mutual Ins Co', 'Grange Ins Assn', 'Sentinel Ins Co'];
const SUFFIX = ['BUILDERS', 'SERVICES', 'CONTRACTING', 'AND SONS CO'];
const LEGAL = ['LLC', 'INC', 'PLLC', ''];

const actives = [], bonds = [], insurance = [];
let n = 0;

for (const cat of CATEGORIES) {
  const codes = cat.specialtyCodes || [];
  const names = cat.specialtyNames || [];
  /* Enough per trade that several cities clear the city-page floor. */
  const perTrade = cat.id === 'general' ? 260 : cat.id === 'pools' ? 5 : 70;

  for (let i = 0; i < perTrade; i++) {
    n++;
    const lic = (cat.id.toUpperCase().replace(/[^A-Z]/g, '') + '000000000').slice(0, 8) + String(n).padStart(4, '0');
    const city = rnd() < 0.45 ? 'SEATTLE'
               : rnd() < 0.4 ? pick(['BELLEVUE', 'KENT', 'RENTON', 'AUBURN', 'KIRKLAND'])
               : pick(KING_COUNTY_CITIES);
    const type = cat.licenseTypes[0] === 'ELECTRICAL CONTRACTOR' ? 'EC'
               : cat.licenseTypes[0] === 'PLUMBING CONTRACTOR' ? 'PC' : 'CC';

    actives.push({
      businessname: (i % 11 === 0 ? "DAVE'S " : i % 7 === 0 ? 'PACIFIC NW ' : '') +
        cat.name.toUpperCase().replace(/[^A-Z ]/g, '').trim().split(' ')[0] +
        ' ' + SUFFIX[i % 4] + ' ' + LEGAL[i % 4],
      contractorlicensenumber: lic,
      ubi: String(600000000 + n),
      city, state: 'WA',
      zip: String(98000 + (n % 200)),
      address1: (100 + n) + ' MAIN ST',
      phonenumber: 2065550000 + n,
      contractorlicensetypecode: type,
      contractorlicensetypecodedesc: cat.licenseTypes[0],
      specialtycode1: codes[0] || '01',
      specialtycode1desc: names[0] || 'GENERAL',
      businesstypecodedesc: pick(['Limited Liability Company', 'Corporation', 'Individual']),
      licenseeffectivedate: (2005 + Math.floor(rnd() * 21)) + '-0' + (1 + (n % 9)) + '-1' + (n % 9) + 'T00:00:00.000',
      licenseexpirationdate: '2027-06-30T00:00:00.000',
      contractorlicensestatus: 'ACTIVE',
      primaryprincipalname: 'SMITH, JOHN'
    });

    /* Around 54% carry a published bond, matching the live shortfall. */
    if (rnd() < 0.54) {
      bonds.push({
        contractorlicensenumber: lic, ubi: String(600000000 + n),
        bondamt: (codes[0] === '01' ? 30000 : pick([15000, 15000, 15000, 30000, 50000])) + '.0000',
        bondfirmname: pick(SURETY),
        bondeffectivedate: '2025-0' + (1 + (n % 9)) + '-01T00:00:00.000',
        bondcanceldate: null,
        bondexpirationdate: 'Until Canceled',
        bondimpaired: n % 400 === 0 ? 'Y' : null,
        bondimpaireddate: n % 400 === 0 ? '2024-03-11T00:00:00.000' : null,
        contractorlicensetypecode: type
      });
      /* A cancelled older bond, so a stale row cannot pass as current. */
      if (n % 25 === 0) bonds.push({
        contractorlicensenumber: lic, ubi: String(600000000 + n),
        bondamt: '12000.0000', bondfirmname: 'Old Surety Co',
        bondeffectivedate: '2019-01-01T00:00:00.000',
        bondcanceldate: '2023-05-01T00:00:00.000',
        bondexpirationdate: 'Until Canceled',
        bondimpaired: null, bondimpaireddate: null,
        contractorlicensetypecode: type
      });
    }

    /* Electrical is deliberately sparse here, as it is in the live file. */
    if (type !== 'EC' && rnd() < 0.94) insurance.push({
      contractorlicensenumber: lic, ubi: String(600000000 + n),
      insuranceamt: pick([1000000, 1000000, 2000000]) + '.0000',
      insurancecompany: pick(CARRIER),
      effectivedate: '2025-01-01T00:00:00.000',
      expirationdate: '2027-01-01T00:00:00.000',
      canceldate: null,
      contractorlicensetypecode: type
    });
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  now: '2026-08-18T00:00:00.000Z',
  actives, bonds, insurance,
  statusMix: [
    { contractorlicensestatus: 'ACTIVE', c: String(actives.length) },
    { contractorlicensestatus: 'EXPIRED', c: '13806' },
    { contractorlicensestatus: 'SUSPENDED', c: '2237' },
    { contractorlicensestatus: 'RE-LICENSED', c: '2021' },
    { contractorlicensestatus: 'OUT OF BUSINESS', c: '997' }
  ]
}));

console.log('Fixture written to ' + OUT);
console.log('  ' + actives.length + ' registrations, ' + bonds.length + ' bond rows, ' +
            insurance.length + ' insurance rows');
