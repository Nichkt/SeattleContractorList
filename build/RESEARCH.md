# Build research notes — recorded 2026-08-18

Findings that the build depends on. Do not change these without re-verifying
against the API, because several of them are counter-intuitive.

## 1. Socrata paging REQUIRES an explicit sort

Paging with `$limit`/`$offset` and no `$order` returns **overlapping and
missing rows**. Measured: pulling the bond dataset unordered produced 80,000
rows containing only 31,171 distinct licence numbers. The same pull with
`$order=:id` produced 80,000 rows containing 37,508 distinct licence numbers,
which matches `select count(distinct contractorlicensenumber)` exactly.

Every paged pull in this build sends `$order=:id`. Removing it silently
corrupts every statistic on the site.

## 2. The published bond file is not a complete mirror of the registry

Roughly 46% of actively registered King County contractors have **no row at
all** in the bond dataset. That rate is flat — between 40% and 48% — for every
licence cohort from 2010 to 2026. Real lapses would vary by cohort; a flat rate
across sixteen years is a property of the file, not of the contractors.

RCW 18.27.040 also lets a contractor file an **assigned savings account** in
place of a surety bond. Those would not appear in a bond file.

**Therefore the site never says "unbonded".** It says the state publishes a
current bond record, or that it does not. `about.html` carries the caveat.

## 3. Insurance data does not cover electrical contractors

Statewide row counts by licence type in the insurance dataset:
CC=74,055, PC=2,404, **EC=290**. There are 1,107 active EC licences in King
County alone, so the file covers a negligible share of them. 96% of King County
electrical contractors have no current insurance row, which is a gap in the
file rather than a finding about electricians.

Insurance statistics are reported for CC and PC only, and say so.

## 4. Bond amounts changed on 1 July 2024 — the old site copy was wrong

RCW 18.27.040 as amended: **general $30,000, specialty $15,000**, effective
1 July 2024. The previous figures were $12,000 and $6,000 and had stood for
22 years.

The data agrees. Modal current bond amounts statewide:
$30,000 x 24,130 | $15,000 x 6,733 | $4,000 x 2,623 | $6,000 x 1,221 | $12,000 x 462

`index.html` and `about.html` previously quoted $12,000/$6,000. Corrected.

## 5. There is no infractions or complaints dataset on data.wa.gov

Searched the catalogue for infraction, violation, lawsuit, citation, penalty,
suspension and claim. L&I publishes no open dataset of contractor infractions.
That history exists only on the `secure.lni.wa.gov/verify` detail pages.

What IS available and is used instead:
- `bondimpaired` / `bondimpaireddate` on the bond file — a bond that has been
  drawn against. 117 statewide, 33 among King County actives. This is the
  closest thing to published claim history and nobody surfaces it.
- `contractorlicensestatus` beyond ACTIVE — King County has 2,237 currently
  SUSPENDED registrations and 13,806 EXPIRED ones.
- Bond and insurance cancellation dates, which reveal coverage gaps.

## 6. Measured baseline (King County, 2026-08-18)

    active                17,122
    expired               13,806
    suspended              2,237
    out of business          997
    current insurance     94% of CC+PC actives
    impaired bonds            33

Trade totals: general 11,751 | electrical 1,081 | painting 671 | flooring 562
| landscaping 534 | plumbing 449 | tile 356 | siding 280 | concrete 206 |
remodeling 164 | hvac 143 | handyman 111 | solar 106 | drywall 97 | roofing 93
| metal 93 | cleanup 76 | fire-security 66 | excavation 55 | carpentry 50 |
garage-doors 50 | fencing 39 | signs 39 | appliances 34 | septic 25 |
abatement 12 | pools 8

## 7. Page floor

27 trades x 45 cities = 1,215 possible city pages. Qualifying combinations by
minimum contractor count: floor 3 -> 374, floor 5 -> 277, **floor 8 -> 193**,
floor 10 -> 158, floor 20 -> 96.

Floor 8 is the setting. Every generated page carries at least eight real
businesses, which keeps them out of scaled-content territory.
