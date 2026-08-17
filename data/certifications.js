/* ==========================================================================
   Certification registry + per-business certification overlay
   --------------------------------------------------------------------------
   TWO separate things live in this file:

   1. CERT_PROGRAMS — a reference table of real, independently-verifiable
      trade certifications, what each one means, how hard it is to
      get, and the official directory where anyone can confirm a company
      currently holds it. This is factual reference data.

   2. BUSINESS_CERTS — the overlay that attaches certifications and review
      counts to specific businesses in the L&I registry.

      *** THIS SHIPS ESSENTIALLY EMPTY ON PURPOSE. ***

      A certification badge is a claim about a specific company. Publishing
      one that is wrong, stale, or invented is worse than publishing nothing:
      it misleads a homeowner at exactly the moment they are deciding who to
      trust with their house. So this file only ever gets entries that were
      confirmed against the certifying body's own directory, each carrying
      the date it was checked and the source it was checked against.

      Use `verifyUrl` on each program below to confirm, then add a row.
      Schema is documented at the bottom of this file.
   ========================================================================== */

const CERT_PROGRAMS = {
  /* ---------------------------------------------------------------- TILE */
  'ctef-cti': {
    label: 'CTEF Certified Tile Installer',
    short: 'CTI',
    body: 'Ceramic Tile Education Foundation',
    tier: 'gold',
    trade: 'tile',
    what: 'A hands-on test. The installer builds a real installation under a time limit and it is graded against the national standard. You cannot get it by sitting through a class. There are only a few thousand in the country.',
    verifyUrl: 'https://www.ceramictilefoundation.org/find-certified-tile-installers'
  },
  'act-cert': {
    label: 'Advanced Certifications for Tile Installers (ACT)',
    short: 'ACT',
    body: 'CTEF / TCAA / NTCA / TCNA joint program',
    tier: 'gold',
    trade: 'tile',
    what: 'Built on top of the CTI, with separate hands-on tests for large tile, membranes, mud floors, mud walls, shower pans, and grouts. Worth asking about for showers and wet areas.',
    verifyUrl: 'https://www.tcaainc.org/act---advanced-certifications-for-tile-installers'
  },
  'ctef-journeyman': {
    label: 'CTEF Journeyman Tile Installer',
    short: 'CTEF JTI',
    body: 'Ceramic Tile Education Foundation',
    tier: 'silver',
    trade: 'tile',
    what: 'The first step toward the full CTI certification.',
    verifyUrl: 'https://www.ceramictilefoundation.org/tile-training-installation-certifications-ctef-overview'
  },
  'ntca-five-star': {
    label: 'NTCA Five Star Contractor',
    short: 'NTCA 5★',
    body: 'National Tile Contractors Association',
    tier: 'gold',
    trade: 'tile',
    what: 'A company certification, not an individual one. It requires certified installers on staff, references, and a commitment to the standards. Renewed each year.',
    verifyUrl: 'https://www.tile-assn.com/page/ntca-five-starsearch'
  },

  /* ------------------------------------------------------------- ROOFING */
  'gaf-master-elite': {
    label: 'GAF Master Elite',
    short: 'GAF Master Elite',
    body: 'GAF',
    tier: 'gold',
    trade: 'roofing',
    what: 'GAF limits this to about the top few percent of roofers in the country. It requires a license, insurance, and a track record, and it unlocks their longest labor warranty.',
    verifyUrl: 'https://www.gaf.com/en-us/roofing-contractors'
  },
  'certainteed-ssm': {
    label: 'CertainTeed SELECT ShingleMaster',
    short: 'CertainTeed SSM',
    body: 'CertainTeed',
    tier: 'gold',
    trade: 'roofing',
    what: 'CertainTeed\'s highest level. Most of the crew has to be certified individually, not just the owner. It unlocks their extended warranties.',
    verifyUrl: 'https://www.certainteed.com/find-a-pro/'
  },
  'owens-preferred': {
    label: 'Owens Corning Platinum / Preferred',
    short: 'OC Platinum',
    body: 'Owens Corning',
    tier: 'silver',
    trade: 'roofing',
    what: 'A manufacturer program in two levels, Preferred and Platinum, tied to warranty eligibility.',
    verifyUrl: 'https://www.owenscorning.com/en-us/roofing/contractors'
  },
  'malarkey-emerald': {
    label: 'Malarkey Emerald Premium Contractor',
    short: 'Malarkey Emerald',
    body: 'Malarkey Roofing Products',
    tier: 'silver',
    trade: 'roofing',
    what: 'Malarkey\'s top level. They are a Portland manufacturer used widely in the Northwest.',
    verifyUrl: 'https://www.malarkeyroofing.com/homeowners/find-a-contractor/'
  },

  /* ------------------------------------------------------------ HVAC */
  'nate': {
    label: 'NATE Certified',
    short: 'NATE',
    body: 'North American Technician Excellence',
    tier: 'gold',
    trade: 'hvac',
    what: 'The best-known independent test for heating and cooling technicians. Individuals earn it per specialty, not the company. Ask how many of the technicians hold it.',
    verifyUrl: 'https://natex.org/homeowner/find-a-contractor-with-nate-certified-technicians/find-a-contractor-with-nate-certified-technicians'
  },
  'epa-608': {
    label: 'EPA Section 608 Refrigerant',
    short: 'EPA 608',
    body: 'US Environmental Protection Agency',
    tier: 'baseline',
    trade: 'hvac',
    what: 'Required by federal law to buy or handle refrigerant. A floor, not a distinction.',
    verifyUrl: 'https://www.epa.gov/section608'
  },
  'bpi-analyst': {
    label: 'BPI Building Analyst',
    short: 'BPI',
    body: 'Building Performance Institute',
    tier: 'silver',
    trade: 'hvac',
    what: 'Whole-house energy work: blower door tests, combustion safety, and the building envelope. Useful for heat pump conversions and rebates.',
    verifyUrl: 'https://www.bpi.org/pages/locator/'
  },

  /* ------------------------------------------------------ LANDSCAPING */
  'isa-arborist': {
    label: 'ISA Certified Arborist',
    short: 'ISA Arborist',
    body: 'International Society of Arboriculture',
    tier: 'gold',
    trade: 'landscaping',
    what: 'The standard credential for cutting into a mature tree. It takes three years of experience, a proctored exam, and continuing education. Seattle\'s tree rules make it worth asking about.',
    verifyUrl: 'https://www.treesaregood.org/findanarborist'
  },
  'isa-trag': {
    label: 'ISA Tree Risk Assessment Qualification',
    short: 'ISA TRAQ',
    body: 'International Society of Arboriculture',
    tier: 'gold',
    trade: 'landscaping',
    what: 'A qualification for judging whether a tree is a hazard. Ask for it behind any removal recommendation or permit report.',
    verifyUrl: 'https://www.treesaregood.org/findanarborist'
  },
  'wsnla-cph': {
    label: 'WA Certified Professional Horticulturist',
    short: 'WSNLA CPH',
    body: 'Washington State Nursery & Landscape Association',
    tier: 'silver',
    trade: 'landscaping',
    what: 'A Washington certification covering plants, soils, pests, and local growing conditions.',
    verifyUrl: 'https://www.wsnla.org/page/CPH'
  },
  'nalp-clt': {
    label: 'NALP Landscape Industry Certified',
    short: 'NALP CLT',
    body: 'National Association of Landscape Professionals',
    tier: 'silver',
    trade: 'landscaping',
    what: 'A national certification with written and hands-on parts in installation, maintenance, or irrigation.',
    verifyUrl: 'https://www.landscapeprofessionals.org/'
  },

  /* ------------------------------------------------- REMODEL / GENERAL */
  'nari-cr': {
    label: 'NARI Certified Remodeler',
    short: 'NARI CR',
    body: 'National Association of the Remodeling Industry',
    tier: 'gold',
    trade: 'general',
    what: 'Requires documented years in the trade, a written exam covering construction and business practice, and a code of ethics.',
    verifyUrl: 'https://nari.org/certify-learn/certifications/'
  },
  'nari-ckbr': {
    label: 'NARI Certified Kitchen & Bath Remodeler',
    short: 'NARI CKBR',
    body: 'National Association of the Remodeling Industry',
    tier: 'gold',
    trade: 'remodeling',
    what: 'NARI\'s kitchen and bath specialty. The one to ask about before a full kitchen remodel.',
    verifyUrl: 'https://nari.org/certify-learn/certifications/certified-kitchen-and-bath-remodeler-ckbr/'
  },
  'nkba-cmkbd': {
    label: 'NKBA Certified Master Kitchen & Bath Designer',
    short: 'NKBA CMKBD',
    body: 'National Kitchen & Bath Association',
    tier: 'gold',
    trade: 'remodeling',
    what: 'The senior design credential from the kitchen and bath association. It covers design work, not construction.',
    verifyUrl: 'https://nkba.org/find-a-designer/'
  },
  'nari-caps': {
    label: 'Certified Aging-in-Place Specialist',
    short: 'CAPS',
    body: 'NAHB',
    tier: 'silver',
    trade: 'remodeling',
    what: 'Training in building for people staying in their homes as they age: walk-in showers, grab bar blocking, wider doors, better lighting.',
    verifyUrl: 'https://www.nahb.org/education-and-events/education/designations/certified-aging-in-place-specialist-caps'
  },
  'nari-cgp': {
    label: 'Certified Green Professional',
    short: 'CGP',
    body: 'NAHB',
    tier: 'silver',
    trade: 'general',
    what: 'Green building practice, covering the envelope, energy, water, and materials.',
    verifyUrl: 'https://www.nahb.org/education-and-events/credentials'
  },

  /* --------------------------------------------------- ELECTRICAL / PV */
  'wa-master-electrician': {
    label: 'WA Master Electrician',
    short: 'WA Master EL',
    body: 'WA Dept. of Labor & Industries',
    tier: 'gold',
    trade: 'electrical',
    what: 'Washington\'s top electrical credential, above journeyman. It requires years at journey level and an exam. The state can confirm it.',
    verifyUrl: 'https://secure.lni.wa.gov/verify/'
  },
  'nabcep-pv': {
    label: 'NABCEP PV Installation Professional',
    short: 'NABCEP PV',
    body: 'North American Board of Certified Energy Practitioners',
    tier: 'gold',
    trade: 'solar-energy',
    what: 'The main credential for solar work. It requires documented installed systems and a hard exam.',
    verifyUrl: 'https://directories.nabcep.org/'
  },
  'wa-journey-plumber': {
    label: 'WA Journey Level Plumber',
    short: 'WA Journey PL',
    body: 'WA Dept. of Labor & Industries',
    tier: 'silver',
    trade: 'plumbing',
    what: 'Washington\'s plumbing credential, earned through documented apprentice hours and an exam. The state can confirm it.',
    verifyUrl: 'https://secure.lni.wa.gov/verify/'
  },

  /* ------------------------------------------------------- CROSS-TRADE */
  'epa-lead': {
    label: 'EPA Lead-Safe Certified Firm',
    short: 'EPA Lead-Safe',
    body: 'US Environmental Protection Agency',
    tier: 'baseline',
    trade: null,
    what: 'Required by law for any firm disturbing paint in a home built before 1978. That covers much of the housing here. Check this one on an older house.',
    verifyUrl: 'https://cdxocsppapps.epa.gov/ocspp-oppt-lead/firm-search'
  },
  'wa-asbestos-cert': {
    label: 'WA Certified Asbestos Contractor',
    short: 'WA Asbestos',
    body: 'WA Dept. of Labor & Industries',
    tier: 'gold',
    trade: 'abatement',
    what: 'Required in Washington for asbestos work, with separate certifications for workers and supervisors.',
    verifyUrl: 'https://lni.wa.gov/safety-health/safety-topics/topics/asbestos'
  },
  'osha-30': {
    label: 'OSHA 30-Hour Construction',
    short: 'OSHA 30',
    body: 'US Dept. of Labor / OSHA',
    tier: 'baseline',
    trade: null,
    what: 'Thirty hours of construction safety training, usually held by a supervisor.',
    verifyUrl: 'https://www.osha.gov/training/outreach'
  },
  'bbb-accredited': {
    label: 'BBB Accredited Business',
    short: 'BBB',
    body: 'Better Business Bureau',
    tier: 'baseline',
    trade: null,
    what: 'A paid membership, not a test of skill. Read the complaints rather than the letter grade.',
    verifyUrl: 'https://www.bbb.org/us/wa/seattle'
  },
  'aws-cwi': {
    label: 'AWS Certified Welding Inspector',
    short: 'AWS CWI',
    body: 'American Welding Society',
    tier: 'gold',
    trade: 'metal',
    what: 'A welding inspection credential requiring experience, a vision test, and a three-part exam.',
    verifyUrl: 'https://www.aws.org/certification-and-education/professional-certification/certified-welding-inspector/'
  },
  'aisc-certified': {
    label: 'AISC Certified Fabricator/Erector',
    short: 'AISC',
    body: 'American Institute of Steel Construction',
    tier: 'gold',
    trade: 'metal',
    what: 'A certification of the fabrication shop itself, backed by independent audits.',
    verifyUrl: 'https://www.aisc.org/certification/'
  },
  'aci-flatwork': {
    label: 'ACI Concrete Flatwork Finisher',
    short: 'ACI Flatwork',
    body: 'American Concrete Institute',
    tier: 'silver',
    trade: 'concrete',
    what: 'Concrete finishing, tested on paper and by hand.',
    verifyUrl: 'https://www.concrete.org/certification.aspx'
  },
  'mca-certified': {
    label: 'Masonry Certification',
    short: 'MCAA',
    body: 'Mason Contractors Association of America',
    tier: 'silver',
    trade: 'concrete',
    what: 'A company masonry certification covering standards and safety.',
    verifyUrl: 'https://masoncontractors.org/'
  },
  'nwfa-certified': {
    label: 'NWFA Certified Professional',
    short: 'NWFA',
    body: 'National Wood Flooring Association',
    tier: 'gold',
    trade: 'flooring',
    what: 'Wood floor installation, sanding, and finishing, with hands-on assessment.',
    verifyUrl: 'https://nwfa.org/certifications-landing-page/'
  },
  'install-certified': {
    label: 'INSTALL Certified Flooring',
    short: 'INSTALL',
    body: 'International Standards & Training Alliance',
    tier: 'silver',
    trade: 'flooring',
    what: 'A union-affiliated flooring certification, common on commercial work.',
    verifyUrl: 'https://installfloors.org/'
  },
  'pca-accredited': {
    label: 'PCA Accredited Painting Contractor',
    short: 'PCA',
    body: 'Painting Contractors Association',
    tier: 'silver',
    trade: 'painting',
    what: 'A company accreditation covering business practice and workmanship standards.',
    verifyUrl: 'https://www.pcapainted.org/'
  },
  'jameshardie-elite': {
    label: 'James Hardie Elite Preferred',
    short: 'Hardie Elite',
    body: 'James Hardie',
    tier: 'gold',
    trade: 'siding',
    what: 'The top installer level for fiber cement siding, which is common throughout the Northwest.',
    verifyUrl: 'https://www.jameshardie.com/find-a-contractor/'
  },
  'certainteed-siding': {
    label: 'CertainTeed Siding Master Craftsman',
    short: 'CT Siding Master',
    body: 'CertainTeed',
    tier: 'silver',
    trade: 'siding',
    what: 'CertainTeed\'s siding credential, separate from their roofing programs.',
    verifyUrl: 'https://www.certainteed.com/find-a-pro/'
  },
  'installmasters': {
    label: 'InstallationMasters (Windows)',
    short: 'InstallMasters',
    body: 'Fenestration & Glazing Industry Alliance',
    tier: 'silver',
    trade: 'siding',
    what: 'Window and door installation. Worth asking about, since most window failures come from bad installation.',
    verifyUrl: 'https://fgiaonline.org/'
  },
  'afa-certified': {
    label: 'AFA Certified Fence Professional',
    short: 'AFA CFP',
    body: 'American Fence Association',
    tier: 'silver',
    trade: 'fencing',
    what: 'A fence industry certification covering installation and standards.',
    verifyUrl: 'https://www.americanfenceassociation.com/'
  },
  'naddi-certified': {
    label: 'NADRA Deck Certification',
    short: 'NADRA',
    body: 'North American Deck & Railing Association',
    tier: 'silver',
    trade: 'fencing',
    what: 'Deck construction and inspection.',
    verifyUrl: 'https://www.nadra.org/'
  },
  'nicet-fire': {
    label: 'NICET Fire Protection',
    short: 'NICET',
    body: 'National Institute for Certification in Engineering Technologies',
    tier: 'gold',
    trade: 'fire-security',
    what: 'Fire protection engineering technology in four levels. Local officials often require it for design work.',
    verifyUrl: 'https://www.nicet.org/'
  },
  'alco-certified': {
    label: 'ALOA Certified Locksmith',
    short: 'ALOA',
    body: 'Associated Locksmiths of America',
    tier: 'silver',
    trade: 'fire-security',
    what: 'Locksmith certification covering security hardware.',
    verifyUrl: 'https://www.aloa.org/'
  },
  'idea-certified': {
    label: 'IDEA Certified Door Technician',
    short: 'IDEA',
    body: 'Institute of Door Dealer Education and Accreditation',
    tier: 'silver',
    trade: 'garage-doors',
    what: 'Garage door systems. Torsion springs are dangerous to work on.',
    verifyUrl: 'https://www.dooreducation.com/'
  },
  'phta-cbp': {
    label: 'PHTA Certified Building Professional',
    short: 'PHTA CBP',
    body: 'Pool & Hot Tub Alliance',
    tier: 'gold',
    trade: 'pools',
    what: 'The senior credential for pool and spa construction.',
    verifyUrl: 'https://www.phta.org/'
  },
  'phta-cpo': {
    label: 'PHTA Certified Pool Operator',
    short: 'CPO',
    body: 'Pool & Hot Tub Alliance',
    tier: 'baseline',
    trade: 'pools',
    what: 'Pool chemistry and daily operations.',
    verifyUrl: 'https://www.phta.org/'
  },
  'wowra-certified': {
    label: 'WOSSA / On-Site Septic Certified',
    short: 'On-Site Septic',
    body: 'WA On-Site Sewage Association',
    tier: 'silver',
    trade: 'septic',
    what: 'Septic design, installation, and maintenance. King County Public Health permits this work separately.',
    verifyUrl: 'https://kingcounty.gov/en/dept/dph/health-safety/environmental-health/on-site-sewage-systems'
  },
  'abpa-tester': {
    label: 'Backflow Assembly Tester (BAT)',
    short: 'BAT',
    body: 'WA Dept. of Health / ABPA',
    tier: 'silver',
    trade: 'septic',
    what: 'State-recognized certification to test backflow assemblies. Most local water utilities require it.',
    verifyUrl: 'https://doh.wa.gov/community-and-environment/drinking-water/water-system-design-and-planning/cross-connection-control-backflow-prevention'
  },
  'awci-certified': {
    label: 'AWCI / Level 5 Finish Certified',
    short: 'AWCI',
    body: 'Association of the Wall and Ceiling Industry',
    tier: 'silver',
    trade: 'drywall',
    what: 'Wall and ceiling training, including the finish levels.',
    verifyUrl: 'https://www.awci.org/'
  },
  'nde-certified': {
    label: 'NDA Certified Demolition Contractor',
    short: 'NDA',
    body: 'National Demolition Association',
    tier: 'silver',
    trade: 'excavation',
    what: 'Demolition industry safety and practice.',
    verifyUrl: 'https://www.demolitionassociation.com/'
  },
  'psa-certified': {
    label: 'PSA Certified Appliance Professional',
    short: 'PSA CAP',
    body: 'Professional Service Association',
    tier: 'silver',
    trade: 'appliances',
    what: 'Appliance repair technician certification.',
    verifyUrl: 'https://www.psaworld.com/'
  },
  'isa-sign-cert': {
    label: 'ISA Certified Sign Professional',
    short: 'ISA Sign',
    body: 'International Sign Association',
    tier: 'silver',
    trade: 'signs',
    what: 'Sign industry certification covering installation and electrical sign safety.',
    verifyUrl: 'https://www.signs.org/'
  },
  'ucars-certified': {
    label: 'UAMCC Certified Contractor',
    short: 'UAMCC',
    body: 'United Association of Mobile Contract Cleaners',
    tier: 'baseline',
    trade: 'cleanup',
    what: 'Power washing and exterior cleaning, covering surfaces and runoff.',
    verifyUrl: 'https://www.uamcc.org/'
  }
};

/* ==========================================================================
   BUSINESS_CERTS — per-business overlay
   --------------------------------------------------------------------------
   Deliberately empty. See the header note at the top of this file.

   Match a business to its L&I record using EITHER `ubi` (preferred — it is
   the stable Washington business identifier and survives name changes) OR
   `license` (the L&I contractor license number). Name matching is
   intentionally not supported, because contractor business names collide
   constantly ("NW Construction LLC" is not one company).

   SCHEMA
   ------
   {
     ubi:     '603320569',          // preferred key
     license: '04CONCL862CR',       // alternate key
     certs: [
       {
         key:      'ctef-cti',      // must exist in CERT_PROGRAMS above
         verified: '2026-08-16',    // ISO date you personally confirmed it
         source:   'https://...'    // the page you confirmed it on
       }
     ],
     reviews: {
       google: { count: 412, rating: 4.8, checked: '2026-08-16',
                 url: 'https://...' },
       yelp:   { count: 96,  rating: 4.5, checked: '2026-08-16',
                 url: 'https://...' }
     },

     // The state publishes no website field, so this only ever holds a URL
     // somebody opened and confirmed belongs to THIS business. Without an
     // entry here the listing shows a "Find site" search instead. Never guess
     // a domain from the company name: contractor names collide constantly,
     // and pointing customers at the wrong company's site is worse than
     // pointing them at nothing.
     website: { url: 'https://...', checked: '2026-08-17' },
     notes: 'Optional short editorial note.'
   }

   Entries without a `verified` date and `source` are rendered as
   "unverified" by the app rather than shown as a clean badge.
   ========================================================================== */

const BUSINESS_CERTS = [
  // Intentionally empty. Add verified entries here — see schema above.
];

/* Build lookup indexes once at load. */
const CERTS_BY_UBI = {};
const CERTS_BY_LICENSE = {};
BUSINESS_CERTS.forEach(function (entry) {
  if (entry.ubi) CERTS_BY_UBI[String(entry.ubi).trim()] = entry;
  if (entry.license) CERTS_BY_LICENSE[String(entry.license).trim().toUpperCase()] = entry;
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CERT_PROGRAMS, BUSINESS_CERTS, CERTS_BY_UBI, CERTS_BY_LICENSE };
}
