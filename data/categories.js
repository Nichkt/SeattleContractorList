/* ==========================================================================
   Trade category taxonomy
   --------------------------------------------------------------------------
   Maps human-friendly trade categories onto the raw values used in the
   WA L&I open-data registry.

   Two registry fields decide what a contractor may do:

     licenseTypes    -> `contractorlicensetypecodedesc`
                        "CONSTRUCTION CONTRACTOR", "ELECTRICAL CONTRACTOR",
                        "PLUMBING CONTRACTOR", "ELEVATOR CONTRACTOR"
     specialtyCodes  -> `specialtycode1` (the short code, e.g. "CD" = ROOFING)

   *** Filter on the CODE, never on `specialtycode1desc`. ***

   Two reasons. First, several descriptions carry stray whitespace in the
   source data — "Heating/Vent/Air-Conditioning and Refrig (HVAC/R) " and
   "Wood/Pellet and Gas Stoves " both have a trailing space, and
   "Sanitation System  / Side sewers" has a double space — so equality
   matching on the description silently returns nothing. Second, several
   descriptions contain commas, which makes for long, fragile query strings.
   The two-character codes are stable, comma-free, and whitespace-free.

   Note that a few codes are reused across license types ("01" is GENERAL
   for construction contractors but JOURNEY LEVEL for electricians), which
   is why every category also constrains licenseTypes.

   `specialtyNames` is documentation only — it is never sent to the API.
   ========================================================================== */

const CATEGORIES = [
  {
    id: 'general',
    name: 'General Contractors',
    blurb: 'Whole-home builds, additions, and multi-trade projects.',
    icon: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['01'],
    specialtyNames: ['GENERAL'],
    certs: ['nari-cr', 'nari-cgp', 'epa-lead', 'bbb-accredited']
  },
  {
    id: 'remodeling',
    name: 'Kitchen & Bath / Remodeling',
    blurb: 'Kitchen and bath renovation, cabinetry, and finish work.',
    icon: 'M4 4h16v16H4zM4 10h16M10 10v10',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SB', '02'],
    specialtyNames: ['Cabinets, Millwork and Finish Carpentry', 'RESIDENTIAL'],
    certs: ['nari-ckbr', 'nkba-cmkbd', 'nari-caps', 'epa-lead']
  },
  {
    id: 'roofing',
    name: 'Roofing',
    blurb: 'Re-roofs, repairs, torch-down, metal, and composition.',
    icon: 'M3 12l9-8 9 8M5 11v9h14v-9',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['CD'],
    specialtyNames: ['ROOFING'],
    certs: ['gaf-master-elite', 'certainteed-ssm', 'owens-preferred', 'malarkey-emerald']
  },
  {
    id: 'landscaping',
    name: 'Landscaping & Tree Care',
    blurb: 'Design, install, maintenance, tree work, and irrigation.',
    icon: 'M12 22V12M12 12a5 5 0 015-5 5 5 0 01-5 5zM12 12a5 5 0 00-5-5 5 5 0 005 5z',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['BW', 'RF', 'BV', '03'],
    specialtyNames: ['LANDSCAPING', 'Tree Removal Service',
                     'IRRIGATION/SPRINKLING SYSTEMS', 'PUMP & IRRIGATION'],
    certs: ['isa-arborist', 'isa-trag', 'wsnla-cph', 'nalp-clt']
  },
  {
    id: 'electrical',
    name: 'Electrical',
    blurb: 'Panel upgrades, rewires, EV chargers, and service work.',
    icon: 'M13 2L4 14h7l-1 8 9-12h-7z',
    licenseTypes: ['ELECTRICAL CONTRACTOR'],
    specialtyCodes: null, // the license type is itself the filter
    specialtyNames: null,
    certs: ['wa-master-electrician', 'nabcep-pv', 'bbb-accredited']
  },
  {
    id: 'plumbing',
    name: 'Plumbing',
    blurb: 'Repipes, water heaters, fixtures, and drain work.',
    icon: 'M8 3v6a4 4 0 004 4 4 4 0 014 4v4M4 9h8M16 17h4',
    licenseTypes: ['PLUMBING CONTRACTOR'],
    specialtyCodes: null,
    specialtyNames: null,
    certs: ['wa-journey-plumber', 'bbb-accredited']
  },
  {
    id: 'hvac',
    name: 'HVAC & Refrigeration',
    blurb: 'Heat pumps, furnaces, AC, ductwork, and refrigeration.',
    icon: 'M12 3v18M3 12h18M6 6l12 12M18 6L6 18',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SM', '6A', '6B', 'AB', 'AC'],
    specialtyNames: ['Heating/Vent/Air-Conditioning and Refrig (HVAC/R)',
                     'HVAC/RFRG', 'HVAC/RFRG-RESTRICTED',
                     'COMMERCIAL/INDUSTRIAL/REFRIG', 'BOILER/STEAM FIT/PROC PIPING'],
    certs: ['nate', 'bpi-analyst', 'epa-608']
  },
  {
    id: 'tile',
    name: 'Tile, Stone & Masonry Tile',
    blurb: 'Ceramic, porcelain, mosaic, natural and manufactured stone.',
    icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['RE'],
    specialtyNames: ['Tile, Ceramic, Mosaic, Natural and MFG Stone'],
    certs: ['ctef-cti', 'act-cert', 'ntca-five-star', 'ctef-journeyman']
  },
  {
    id: 'flooring',
    name: 'Flooring & Countertops',
    blurb: 'Hardwood, LVP, carpet, and counter fabrication/install.',
    icon: 'M3 6h18M3 12h18M3 18h18',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SK'],
    specialtyNames: ['Floor Covering and Counter Tops'],
    certs: ['nwfa-certified', 'install-certified', 'ctef-cti']
  },
  {
    id: 'painting',
    name: 'Painting & Wallcovering',
    blurb: 'Interior and exterior painting, staining, and coatings.',
    icon: 'M4 4h12v6H4zM10 10v4a2 2 0 002 2h1v5h-4v-5',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['CB'],
    specialtyNames: ['PAINTING/WALLCOVERING'],
    certs: ['epa-lead', 'pca-accredited', 'bbb-accredited']
  },
  {
    id: 'concrete',
    name: 'Concrete, Masonry & Paving',
    blurb: 'Flatwork, foundations, brick, block, and asphalt.',
    icon: 'M3 8h18v10H3zM3 8l3-4h12l3 4M9 8v10M15 8v10',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['BI', 'BZ', 'SS'],
    specialtyNames: ['CONCRETE', 'MASONRY', 'Paving/ Striping/ Seal Coating'],
    certs: ['aci-flatwork', 'mca-certified', 'bbb-accredited']
  },
  {
    id: 'fencing',
    name: 'Fencing & Decking',
    blurb: 'Wood, vinyl, and metal fencing plus deck construction.',
    icon: 'M4 8v12M9 8v12M14 8v12M19 8v12M2 11h20M2 15h20',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['BN'],
    specialtyNames: ['FENCING'],
    certs: ['afa-certified', 'naddi-certified', 'bbb-accredited']
  },
  {
    id: 'siding',
    name: 'Siding, Gutters & Windows',
    blurb: 'Siding replacement, gutters, glazing, and window install.',
    icon: 'M4 3h16v18H4zM4 9h16M4 15h16M12 3v18',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SW', 'CV', 'BP', 'RH', 'SA'],
    specialtyNames: ['Siding', 'GUTTERS/DOWNSPOUTS', 'GLAZING/GLASS',
                     'Window Coverings', 'Awnings, Canopies, Patio Covers, Exterior Screens'],
    certs: ['jameshardie-elite', 'certainteed-siding', 'installmasters', 'epa-lead']
  },
  {
    id: 'carpentry',
    name: 'Carpentry & Framing',
    blurb: 'Framing, rough carpentry, and structural wood work.',
    icon: 'M3 20l6-6M9 14l4-11 8 8-11 4z',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SL'],
    specialtyNames: ['Framing and Rough Carpentry'],
    certs: ['nari-cr', 'epa-lead']
  },
  {
    id: 'drywall',
    name: 'Drywall, Insulation & Plaster',
    blurb: 'Hanging, taping, texture, insulation, and acoustics.',
    icon: 'M3 4h18v16H3zM3 12h18',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['BK', 'SO', 'SP', 'RA'],
    specialtyNames: ['DRY WALL', 'Insulation and Acoustical',
                     'Lathing and Plastering', 'Suspended Ceiling and Acoustical Tile'],
    certs: ['bpi-analyst', 'epa-lead', 'awci-certified']
  },
  {
    id: 'handyman',
    name: 'Handyman & Maintenance',
    blurb: 'Small repairs, punch lists, and general property upkeep.',
    icon: 'M14 6l4 4-9 9H5v-4zM13 7l4 4',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['HM', '07', '7B', 'RP'],
    specialtyNames: ['HANDYMAN', 'MAINTENANCE', 'RESIDENTIAL MAINTENANCE', 'REPAIR'],
    certs: ['epa-lead', 'bbb-accredited']
  },
  {
    id: 'excavation',
    name: 'Excavation & Demolition',
    blurb: 'Grading, land clearing, demolition, and tank removal.',
    icon: 'M3 18h18M5 18v-4h6v4M11 14l6-6 4 4-4 4',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SI', 'SF', 'RC', 'SH'],
    specialtyNames: ['Excavation, Grading and Land Clearing', 'Demolition and Salvage',
                     'Tanks and Tank Removal', 'Drilling, Blasting and Soil Sampling'],
    certs: ['nde-certified', 'osha-30', 'bbb-accredited']
  },
  {
    id: 'septic',
    name: 'Septic, Sewer & Water',
    blurb: 'Side sewers, sanitation systems, wells, and backflow.',
    icon: 'M12 3c3 5 6 7 6 11a6 6 0 01-12 0c0-4 3-6 6-11z',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SU', 'WD', '30', '3A', 'RK'],
    specialtyNames: ['Sanitation System / Side sewers', 'WELL DRILLING',
                     'BACKFLOW SPECIALTY', 'Domestic Pump', 'Drain Cleaning / Snaking'],
    certs: ['wowra-certified', 'abpa-tester', 'bbb-accredited']
  },
  {
    id: 'garage-doors',
    name: 'Garage Doors & Gates',
    blurb: 'Overhead doors, openers, gates, and activating devices.',
    icon: 'M3 21V8l9-5 9 5v13M3 12h18M3 16h18',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['OG', 'SG', '10'],
    specialtyNames: ['OVERHEAD/GARAGE DOORS', 'Doors, Gates and Activating Devices',
                     'DOORS & GATES SPECIALTY'],
    certs: ['idea-certified', 'bbb-accredited']
  },
  {
    id: 'solar-energy',
    name: 'Solar & Low Voltage',
    blurb: 'Solar PV, battery storage, and limited-energy systems.',
    icon: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M12 8a4 4 0 100 8 4 4 0 000-8z',
    licenseTypes: ['ELECTRICAL CONTRACTOR'],
    specialtyCodes: ['06'],
    specialtyNames: ['LIMITED ENERGY'],
    certs: ['nabcep-pv', 'wa-master-electrician']
  },
  {
    id: 'fire-security',
    name: 'Fire Protection & Security',
    blurb: 'Sprinkler systems, alarms, locks, and security equipment.',
    icon: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['BO', 'SQ'],
    specialtyNames: ['FIRE PROTECT SYSTEM', 'Locks, Security and Alarm Equipment'],
    certs: ['nicet-fire', 'alco-certified', 'bbb-accredited']
  },
  {
    id: 'metal',
    name: 'Welding & Metal Fabrication',
    blurb: 'Structural steel, ornamental metal, and fabrication.',
    icon: 'M4 20l8-8M12 12l8-8M8 8l8 8',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['RI', 'CG', 'SY'],
    specialtyNames: ['Welding and Ornamental Metal', 'METAL FABRICATION', 'Steel Erectors'],
    certs: ['aws-cwi', 'aisc-certified']
  },
  {
    id: 'pools',
    name: 'Pools, Spas & Hot Tubs',
    blurb: 'Pool and spa construction, service, and renovation.',
    icon: 'M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M6 14V5a2 2 0 014 0M14 14V5a2 2 0 014 0',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['RB'],
    specialtyNames: ['Swimming Pools, Spas and Hot Tubs'],
    certs: ['phta-cbp', 'phta-cpo', 'bbb-accredited']
  },
  {
    id: 'abatement',
    name: 'Asbestos, Lead & Pest',
    blurb: 'Hazardous material abatement and structural pest control.',
    icon: 'M12 3l9 16H3zM12 9v5M12 17h.01',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['XX', 'SZ'],
    specialtyNames: ['Asbestos and Lead', 'Structural Pest Control'],
    certs: ['epa-lead', 'wa-asbestos-cert', 'osha-30']
  },
  {
    id: 'cleanup',
    name: 'Pressure Washing & Cleanup',
    blurb: 'Exterior cleaning, sandblasting, and site clean-up.',
    icon: 'M6 3v6M6 9c0 4 3 4 3 8v4M18 3v18M14 8h8',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['PW', 'SE', 'ST'],
    specialtyNames: ['PRESSURE WASHING', 'Construction Clean-up', 'Sandblasting'],
    certs: ['ucars-certified', 'bbb-accredited']
  },
  {
    id: 'appliances',
    name: 'Appliances & Equipment',
    blurb: 'Appliance installation, repair, and industrial equipment.',
    icon: 'M5 3h14v18H5zM5 9h14M9 6h.01M9 14h.01',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['BG', '7D', 'SN', '7E'],
    specialtyNames: ['APPLIANCES/EQUIPMENT', 'APPLIANCE REPAIR',
                     'Industrial Equipment/Machines', 'EQUIPMENT REPAIR'],
    certs: ['psa-certified', 'epa-608', 'bbb-accredited']
  },
  {
    id: 'signs',
    name: 'Signs & Awnings',
    blurb: 'Sign fabrication, installation, and service.',
    icon: 'M4 4h16v10H4zM12 14v6M8 20h8',
    licenseTypes: ['CONSTRUCTION CONTRACTOR'],
    specialtyCodes: ['SX'],
    specialtyNames: ['Signs'],
    certs: ['isa-sign-cert', 'bbb-accredited']
  }
];

/* Every incorporated city, town, and major unincorporated place in King
   County. The L&I dataset carries a mailing city but no county field, so
   this list is how the statewide registry gets narrowed to King County.
   See about.html for why that is an approximation of service area. */
const KING_COUNTY_CITIES = [
  'ALGONA', 'AUBURN', 'BEAUX ARTS VILLAGE', 'BELLEVUE', 'BLACK DIAMOND',
  'BOTHELL', 'BURIEN', 'CARNATION', 'CLYDE HILL', 'COVINGTON', 'DES MOINES',
  'DUVALL', 'ENUMCLAW', 'FALL CITY', 'FEDERAL WAY', 'HOBART', 'HUNTS POINT',
  'ISSAQUAH', 'KENMORE', 'KENT', 'KIRKLAND', 'LAKE FOREST PARK',
  'MAPLE VALLEY', 'MEDINA', 'MERCER ISLAND', 'MILTON', 'NEWCASTLE',
  'NORMANDY PARK', 'NORTH BEND', 'PACIFIC', 'PRESTON', 'RAVENSDALE',
  'REDMOND', 'RENTON', 'SAMMAMISH', 'SEATAC', 'SEATTLE', 'SHORELINE',
  'SKYKOMISH', 'SNOQUALMIE', 'SNOQUALMIE PASS', 'TUKWILA', 'VASHON',
  'WOODINVILLE', 'YARROW POINT'
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CATEGORIES, KING_COUNTY_CITIES };
}
