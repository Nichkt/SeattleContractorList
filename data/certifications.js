/* ==========================================================================
   Certification registry + per-business certification overlay
   --------------------------------------------------------------------------
   TWO separate things live in this file:

   1. CERT_PROGRAMS — a reference table of real, independently-verifiable
      trade certifications, what each one actually means, how hard it is to
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
    what: 'A hands-on, proctored test: the installer builds a real installation in a fixed time window and it is graded against ANSI standards. It is one of the few tile credentials in the US that cannot be earned by sitting through a class, and there are only a few thousand CTIs nationwide.',
    verifyUrl: 'https://www.ceramictilefoundation.org/find-certified-tile-installers'
  },
  'act-cert': {
    label: 'Advanced Certifications for Tile Installers (ACT)',
    short: 'ACT',
    body: 'CTEF / TCAA / NTCA / TCNA joint program',
    tier: 'gold',
    trade: 'tile',
    what: 'Stacked on top of CTI. Separate hands-on modules for large-format tile, membranes, mud floors, mud walls, shower receptors, and grouts. Holding several ACT modules is a strong signal for wet areas and showers.',
    verifyUrl: 'https://www.tcaainc.org/act---advanced-certifications-for-tile-installers'
  },
  'ctef-journeyman': {
    label: 'CTEF Journeyman Tile Installer',
    short: 'CTEF JTI',
    body: 'Ceramic Tile Education Foundation',
    tier: 'silver',
    trade: 'tile',
    what: 'Entry-level CTEF credential for installers working toward full CTI status.',
    verifyUrl: 'https://www.ceramictilefoundation.org/tile-training-installation-certifications-ctef-overview'
  },
  'ntca-five-star': {
    label: 'NTCA Five Star Contractor',
    short: 'NTCA 5★',
    body: 'National Tile Contractors Association',
    tier: 'gold',
    trade: 'tile',
    what: 'Company-level (not individual) recognition requiring certified installers on staff, references, and a standards commitment. Renewed annually.',
    verifyUrl: 'https://www.tile-assn.com/page/FiveStar'
  },

  /* ------------------------------------------------------------- ROOFING */
  'gaf-master-elite': {
    label: 'GAF Master Elite',
    short: 'GAF Master Elite',
    body: 'GAF',
    tier: 'gold',
    trade: 'roofing',
    what: 'GAF caps this at roughly the top few percent of roofers in the country. Requires licensing, insurance, and a track record, and it is what unlocks GAF\'s longest workmanship warranties.',
    verifyUrl: 'https://www.gaf.com/en-us/roofing-contractors'
  },
  'certainteed-ssm': {
    label: 'CertainTeed SELECT ShingleMaster',
    short: 'CertainTeed SSM',
    body: 'CertainTeed',
    tier: 'gold',
    trade: 'roofing',
    what: 'CertainTeed\'s highest credential, requiring a majority of crews to be individually shingle-certified. Unlocks the SureStart PLUS extended warranties.',
    verifyUrl: 'https://www.certainteed.com/find-a-pro/'
  },
  'owens-preferred': {
    label: 'Owens Corning Platinum / Preferred',
    short: 'OC Platinum',
    body: 'Owens Corning',
    tier: 'silver',
    trade: 'roofing',
    what: 'Tiered manufacturer program (Preferred, then Platinum) tied to warranty eligibility and periodic review.',
    verifyUrl: 'https://www.owenscorning.com/en-us/roofing/contractors'
  },
  'malarkey-emerald': {
    label: 'Malarkey Emerald Premium Contractor',
    short: 'Malarkey Emerald',
    body: 'Malarkey Roofing Products',
    tier: 'silver',
    trade: 'roofing',
    what: 'Top tier for Malarkey, a Portland-based manufacturer widely specified in the Pacific Northwest.',
    verifyUrl: 'https://www.malarkeyroofing.com/contractor-locator'
  },

  /* ------------------------------------------------------------ HVAC */
  'nate': {
    label: 'NATE Certified',
    short: 'NATE',
    body: 'North American Technician Excellence',
    tier: 'gold',
    trade: 'hvac',
    what: 'The most widely recognized independent HVAC technician certification in the US. Tested per specialty (gas heat, heat pump, air conditioning) rather than granted company-wide, so ask how many of the techs actually hold it.',
    verifyUrl: 'https://natex.org/homeowner/find-a-contractor-with-nate-certified-technicians/find-a-contractor-with-nate-certified-technicians'
  },
  'epa-608': {
    label: 'EPA Section 608 Refrigerant',
    short: 'EPA 608',
    body: 'US Environmental Protection Agency',
    tier: 'baseline',
    trade: 'hvac',
    what: 'Federally required to purchase or handle refrigerant. Treat this as a floor, not a distinction: any tech touching refrigerant must have it.',
    verifyUrl: 'https://www.epa.gov/section608'
  },
  'bpi-analyst': {
    label: 'BPI Building Analyst',
    short: 'BPI',
    body: 'Building Performance Institute',
    tier: 'silver',
    trade: 'hvac',
    what: 'Whole-house energy diagnostics — blower door, combustion safety, envelope. Relevant for heat pump conversions and weatherization rebates.',
    verifyUrl: 'https://www.bpi.org/find-a-contractor/'
  },

  /* ------------------------------------------------------ LANDSCAPING */
  'isa-arborist': {
    label: 'ISA Certified Arborist',
    short: 'ISA Arborist',
    body: 'International Society of Arboriculture',
    tier: 'gold',
    trade: 'landscaping',
    what: 'The standard credential for anyone cutting into a mature tree. Requires three years of experience plus a proctored exam and ongoing CEUs. Seattle\'s tree regulations make this especially worth insisting on.',
    verifyUrl: 'https://www.treesaregood.org/findanarborist'
  },
  'isa-trag': {
    label: 'ISA Tree Risk Assessment Qualification',
    short: 'ISA TRAQ',
    body: 'International Society of Arboriculture',
    tier: 'gold',
    trade: 'landscaping',
    what: 'Specific qualification for judging whether a tree is a hazard. This is the credential you want behind a removal recommendation or a report for a permit.',
    verifyUrl: 'https://www.treesaregood.org/findanarborist'
  },
  'wsnla-cph': {
    label: 'WA Certified Professional Horticulturist',
    short: 'WSNLA CPH',
    body: 'Washington State Nursery & Landscape Association',
    tier: 'silver',
    trade: 'landscaping',
    what: 'Washington-specific horticulture certification covering plant ID, soils, pests, and PNW growing conditions.',
    verifyUrl: 'https://www.wsnla.org/page/CPH'
  },
  'nalp-clt': {
    label: 'NALP Landscape Industry Certified',
    short: 'NALP CLT',
    body: 'National Association of Landscape Professionals',
    tier: 'silver',
    trade: 'landscaping',
    what: 'National technician certification with written and hands-on components in installation, maintenance, or irrigation.',
    verifyUrl: 'https://www.landscapeprofessionals.org/'
  },

  /* ------------------------------------------------- REMODEL / GENERAL */
  'nari-cr': {
    label: 'NARI Certified Remodeler',
    short: 'NARI CR',
    body: 'National Association of the Remodeling Industry',
    tier: 'gold',
    trade: 'general',
    what: 'Requires documented years in the trade, a broad written exam covering business practice and construction technology, and adherence to a code of ethics.',
    verifyUrl: 'https://nari.org/certify-learn/certifications/'
  },
  'nari-ckbr': {
    label: 'NARI Certified Kitchen & Bath Remodeler',
    short: 'NARI CKBR',
    body: 'National Association of the Remodeling Industry',
    tier: 'gold',
    trade: 'remodeling',
    what: 'NARI\'s kitchen and bath specialization — the most relevant NARI credential for a gut kitchen or bath.',
    verifyUrl: 'https://nari.org/certify-learn/certifications/certified-kitchen-and-bath-remodeler-ckbr/'
  },
  'nkba-cmkbd': {
    label: 'NKBA Certified Master Kitchen & Bath Designer',
    short: 'NKBA CMKBD',
    body: 'National Kitchen & Bath Association',
    tier: 'gold',
    trade: 'remodeling',
    what: 'The senior NKBA design credential, requiring many years of documented design experience plus examination. Design-side rather than build-side.',
    verifyUrl: 'https://nkba.org/find-a-pro/'
  },
  'nari-caps': {
    label: 'Certified Aging-in-Place Specialist',
    short: 'CAPS',
    body: 'NAHB',
    tier: 'silver',
    trade: 'remodeling',
    what: 'Training in accessible and aging-in-place design — zero-threshold showers, grab blocking, door widths, lighting.',
    verifyUrl: 'https://www.nahb.org/education-and-events/education/designations/certified-aging-in-place-specialist-caps'
  },
  'nari-cgp': {
    label: 'Certified Green Professional',
    short: 'CGP',
    body: 'NAHB',
    tier: 'silver',
    trade: 'general',
    what: 'Green building practice — envelope, energy, water, and materials.',
    verifyUrl: 'https://www.nahb.org/education-and-events/education/designations'
  },

  /* --------------------------------------------------- ELECTRICAL / PV */
  'wa-master-electrician': {
    label: 'WA Master Electrician',
    short: 'WA Master EL',
    body: 'WA Dept. of Labor & Industries',
    tier: 'gold',
    trade: 'electrical',
    what: 'The top state electrical credential above journeyman, requiring years at journey level plus examination. Verifiable directly through L&I.',
    verifyUrl: 'https://secure.lni.wa.gov/verify/'
  },
  'nabcep-pv': {
    label: 'NABCEP PV Installation Professional',
    short: 'NABCEP PV',
    body: 'North American Board of Certified Energy Practitioners',
    tier: 'gold',
    trade: 'solar-energy',
    what: 'The recognized gold standard for solar PV installation, requiring documented installed systems plus a rigorous exam.',
    verifyUrl: 'https://www.nabcep.org/certification/certificant-locator/'
  },
  'wa-journey-plumber': {
    label: 'WA Journey Level Plumber',
    short: 'WA Journey PL',
    body: 'WA Dept. of Labor & Industries',
    tier: 'silver',
    trade: 'plumbing',
    what: 'State plumbing credential requiring documented apprenticeship hours plus examination. Verifiable through L&I.',
    verifyUrl: 'https://secure.lni.wa.gov/verify/'
  },

  /* ------------------------------------------------------- CROSS-TRADE */
  'epa-lead': {
    label: 'EPA Lead-Safe Certified Firm',
    short: 'EPA Lead-Safe',
    body: 'US Environmental Protection Agency',
    tier: 'baseline',
    trade: null,
    what: 'Legally required for any firm disturbing painted surfaces in housing built before 1978 — which is a very large share of Seattle\'s housing stock. Verify this one specifically for older homes.',
    verifyUrl: 'https://www.epa.gov/lead/locate-lead-safe-certified-firm'
  },
  'wa-asbestos-cert': {
    label: 'WA Certified Asbestos Contractor',
    short: 'WA Asbestos',
    body: 'WA Dept. of Labor & Industries',
    tier: 'gold',
    trade: 'abatement',
    what: 'Required for asbestos abatement in Washington, with separate worker and supervisor certifications.',
    verifyUrl: 'https://lni.wa.gov/safety-health/safety-topics/topics/asbestos'
  },
  'osha-30': {
    label: 'OSHA 30-Hour Construction',
    short: 'OSHA 30',
    body: 'US Dept. of Labor / OSHA',
    tier: 'baseline',
    trade: null,
    what: 'Thirty-hour construction safety training, typically held by supervisors.',
    verifyUrl: 'https://www.osha.gov/training/outreach'
  },
  'bbb-accredited': {
    label: 'BBB Accredited Business',
    short: 'BBB',
    body: 'Better Business Bureau',
    tier: 'baseline',
    trade: null,
    what: 'A paid accreditation, not a skills test. Useful mainly as a complaint-history record — read the complaints, not the letter grade.',
    verifyUrl: 'https://www.bbb.org/us/wa/seattle'
  },
  'aws-cwi': {
    label: 'AWS Certified Welding Inspector',
    short: 'AWS CWI',
    body: 'American Welding Society',
    tier: 'gold',
    trade: 'metal',
    what: 'Rigorous welding inspection credential requiring experience, a vision exam, and a three-part test.',
    verifyUrl: 'https://www.aws.org/certification-and-education/certification/'
  },
  'aisc-certified': {
    label: 'AISC Certified Fabricator/Erector',
    short: 'AISC',
    body: 'American Institute of Steel Construction',
    tier: 'gold',
    trade: 'metal',
    what: 'Facility-level structural steel certification with independent audits.',
    verifyUrl: 'https://www.aisc.org/certification/'
  },
  'aci-flatwork': {
    label: 'ACI Concrete Flatwork Finisher',
    short: 'ACI Flatwork',
    body: 'American Concrete Institute',
    tier: 'silver',
    trade: 'concrete',
    what: 'Written and performance-tested certification for concrete finishing.',
    verifyUrl: 'https://www.concrete.org/certification.aspx'
  },
  'mca-certified': {
    label: 'Masonry Certification',
    short: 'MCAA',
    body: 'Mason Contractors Association of America',
    tier: 'silver',
    trade: 'concrete',
    what: 'Company-level masonry certification covering standards and safety practice.',
    verifyUrl: 'https://masoncontractors.org/'
  },
  'nwfa-certified': {
    label: 'NWFA Certified Professional',
    short: 'NWFA',
    body: 'National Wood Flooring Association',
    tier: 'gold',
    trade: 'flooring',
    what: 'Wood flooring installation, sanding, and finishing certification with hands-on assessment.',
    verifyUrl: 'https://nwfa.org/find-a-professional/'
  },
  'install-certified': {
    label: 'INSTALL Certified Flooring',
    short: 'INSTALL',
    body: 'International Standards & Training Alliance',
    tier: 'silver',
    trade: 'flooring',
    what: 'Union-affiliated flooring installation certification, common on commercial work.',
    verifyUrl: 'https://installfloors.org/'
  },
  'pca-accredited': {
    label: 'PCA Accredited Painting Contractor',
    short: 'PCA',
    body: 'Painting Contractors Association',
    tier: 'silver',
    trade: 'painting',
    what: 'Company accreditation covering business practice and workmanship standards.',
    verifyUrl: 'https://www.pcapainted.org/'
  },
  'jameshardie-elite': {
    label: 'James Hardie Elite Preferred',
    short: 'Hardie Elite',
    body: 'James Hardie',
    tier: 'gold',
    trade: 'siding',
    what: 'Top installer tier for fiber cement siding — the dominant siding product in the Pacific Northwest climate.',
    verifyUrl: 'https://www.jameshardie.com/find-a-contractor/'
  },
  'certainteed-siding': {
    label: 'CertainTeed Siding Master Craftsman',
    short: 'CT Siding Master',
    body: 'CertainTeed',
    tier: 'silver',
    trade: 'siding',
    what: 'Siding-specific CertainTeed credential distinct from its roofing programs.',
    verifyUrl: 'https://www.certainteed.com/find-a-pro/'
  },
  'installmasters': {
    label: 'InstallationMasters (Windows)',
    short: 'InstallMasters',
    body: 'Fenestration & Glazing Industry Alliance',
    tier: 'silver',
    trade: 'siding',
    what: 'Window and door installation certification — worth asking about, since most window failures are installation failures rather than product failures.',
    verifyUrl: 'https://fgiaonline.org/'
  },
  'afa-certified': {
    label: 'AFA Certified Fence Professional',
    short: 'AFA CFP',
    body: 'American Fence Association',
    tier: 'silver',
    trade: 'fencing',
    what: 'Fence industry certification covering installation practice and standards.',
    verifyUrl: 'https://www.americanfenceassociation.com/'
  },
  'naddi-certified': {
    label: 'NADRA Deck Certification',
    short: 'NADRA',
    body: 'North American Deck & Railing Association',
    tier: 'silver',
    trade: 'fencing',
    what: 'Deck inspection and construction certification — meaningful given deck collapse risk and code requirements.',
    verifyUrl: 'https://www.nadra.org/'
  },
  'nicet-fire': {
    label: 'NICET Fire Protection',
    short: 'NICET',
    body: 'National Institute for Certification in Engineering Technologies',
    tier: 'gold',
    trade: 'fire-security',
    what: 'Four-level fire protection engineering technology certification, frequently required by AHJs for design work.',
    verifyUrl: 'https://www.nicet.org/'
  },
  'alco-certified': {
    label: 'ALOA Certified Locksmith',
    short: 'ALOA',
    body: 'Associated Locksmiths of America',
    tier: 'silver',
    trade: 'fire-security',
    what: 'Locksmith certification tiers covering security hardware competence.',
    verifyUrl: 'https://www.aloa.org/'
  },
  'idea-certified': {
    label: 'IDEA Certified Door Technician',
    short: 'IDEA',
    body: 'Institute of Door Dealer Education and Accreditation',
    tier: 'silver',
    trade: 'garage-doors',
    what: 'Garage door systems certification — relevant because torsion springs are genuinely dangerous to work on.',
    verifyUrl: 'https://www.dooreducation.com/'
  },
  'phta-cbp': {
    label: 'PHTA Certified Building Professional',
    short: 'PHTA CBP',
    body: 'Pool & Hot Tub Alliance',
    tier: 'gold',
    trade: 'pools',
    what: 'Senior pool and spa construction credential.',
    verifyUrl: 'https://www.phta.org/'
  },
  'phta-cpo': {
    label: 'PHTA Certified Pool Operator',
    short: 'CPO',
    body: 'Pool & Hot Tub Alliance',
    tier: 'baseline',
    trade: 'pools',
    what: 'Pool chemistry and operations certification.',
    verifyUrl: 'https://www.phta.org/'
  },
  'wowra-certified': {
    label: 'WOSSA / On-Site Septic Certified',
    short: 'On-Site Septic',
    body: 'WA On-Site Sewage Association',
    tier: 'silver',
    trade: 'septic',
    what: 'Septic design, installation, and maintenance certification. King County Public Health separately permits on-site sewage work.',
    verifyUrl: 'https://kingcounty.gov/en/dept/dph/certificates-permits/onsite-sewage-system'
  },
  'abpa-tester': {
    label: 'Backflow Assembly Tester (BAT)',
    short: 'BAT',
    body: 'WA Dept. of Health / ABPA',
    tier: 'silver',
    trade: 'septic',
    what: 'State-recognized certification to test backflow prevention assemblies, required by most local water purveyors.',
    verifyUrl: 'https://doh.wa.gov/community-and-environment/drinking-water/water-system-design-and-planning/cross-connection-control'
  },
  'awci-certified': {
    label: 'AWCI / Level 5 Finish Certified',
    short: 'AWCI',
    body: 'Association of the Wall and Ceiling Industry',
    tier: 'silver',
    trade: 'drywall',
    what: 'Wall and ceiling industry training and finish-level standards competence.',
    verifyUrl: 'https://www.awci.org/'
  },
  'nde-certified': {
    label: 'NDA Certified Demolition Contractor',
    short: 'NDA',
    body: 'National Demolition Association',
    tier: 'silver',
    trade: 'excavation',
    what: 'Demolition industry safety and practice certification.',
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
    what: 'Power washing and exterior cleaning industry certification covering surface and environmental practice.',
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
