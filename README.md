# King County Contractor Directory

A static site that lists **every actively registered contractor in King County,
Washington** — general contractors, roofers, landscapers, tilers, electricians,
plumbers, HVAC, and ~20 more trades — and verifies **Licensed · Bonded ·
Insured** live against the state registry on every page load.

No backend. No database. No API key. It runs on GitHub Pages.

---

## How it works

The site queries three public Washington State L&I datasets directly from the
visitor's browser via the Socrata Open Data API, which serves them with
permissive CORS for public read-only access:

| Dataset | ID | What it provides |
|---|---|---|
| [General](https://data.wa.gov/Labor/L-I-Contractor-License-Data-General/m8qx-ubtq) | `m8qx-ubtq` | Name, license #, type, specialty, status, dates, address, UBI |
| [Bond](https://data.wa.gov/Labor/L-I-Contractor-License-Data-Bond/bzff-4fmt) | `bzff-4fmt` | Surety firm, bond amount, effective/expiration |
| [Insurance](https://data.wa.gov/Labor/L-I-Contractor-License-Data-Insurance/ciwg-agsx) | `ciwg-agsx` | Carrier, policy #, coverage amount, expiration |

They are joined on `contractorlicensenumber` at page load. All three badges turn
green only when each dataset independently confirms current, unexpired coverage.

Because nothing is cached or committed, the directory can never go stale — which
matters, because a stale copy of "who is insured" is exactly the failure mode
this site exists to avoid.

---

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "King County contractor directory"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then: **Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `root` → Save.**

Live at `https://<you>.github.io/<repo>/` in a minute or two.

There is no build step. `.nojekyll` is included so GitHub serves the files as-is.
To use a custom domain, add a `CNAME` file containing the domain.

---

## Files

```
index.html              Directory UI
rankings.html           Per-trade top 100 + award tiers
review.html             Review submission form
certifications.html     Certification reference guide (generated from data)
about.html              Methodology, scoring explainer, limitations
assets/app.js           Socrata queries, 3-dataset join, filtering, rendering
assets/scoring.js       Tabelog-style scoring engine (pure functions)
assets/styles.css       Light + dark theme
data/categories.js      Trade taxonomy -> L&I specialty codes + license types
data/certifications.js  Certification registry + per-business overlay
data/reviews.js         Review store, local layer, backend hook
test/smoke.js           Headless Playwright test (mocked API)
test/scoring.test.js    Scoring engine unit tests
```

Run the tests:

```bash
npm i -D playwright && npx playwright install chromium
node test/scoring.test.js   # 45 checks, no browser needed
node test/smoke.js          # 50 checks, headless Chromium
node test/links.js          # external link checker (needs network)
```

`links.js` is separate because it needs real network access, unlike the other
two. Run it after touching `data/certifications.js`, and every few months
regardless — trade associations reorganise their sites constantly. A
certification guide whose "verify this" links 404 is worse than no guide.

It distinguishes genuinely dead links from ones that merely block scripts: a
403 is usually bot-filtering, not a missing page, and is reported as CHECK BY
HAND rather than broken. It also catches the nastier case of a dead path that
redirects to a site's own 404 template and answers 200.

84 checks in total, covering query construction, the bond/insurance join,
expiry logic, SoQL escaping, the scoring curve, calibration, award assignment,
and the end-to-end review flow.

---

## The review system

Modelled on Tabelog. The point of that model is not the 1.00–5.00 range but how
hard it is to climb: most businesses land between 3.0 and 3.5, and 4.0+ is
roughly the top 1%. A scale where everyone scores 4.7 carries no information.

**Six axes** — workmanship (weighted heaviest), communication, schedule, value,
site conduct, follow-up. Skipped axes are excluded, not zeroed.

**Bayesian shrinkage** — `score = (C·m + Σwᵢrᵢ) / (C + Σwᵢ)`. One five-star
review yields ~3.46, not 5.00. This is the anti-gaming mechanism: a handful of
reviews from friends (or a competitor's one-star campaign) structurally cannot
move a score.

**Empirical calibration** — home-services reviews run generous, clustering at
4.5+. The population is linearly remapped so the mean lands on 3.20 *and* the
spread lands on the target. Rescaling the mean alone was tried first and was
wrong: it compressed variance by the same factor and left every award tier
mathematically unreachable. Both moments have to be mapped.

**Recency decay** — weight halves every four years, floored at 0.25.

**Population-relative awards** — Gold is the top 1%, Silver 5%, Bronze 15%,
each with a floor score so a weak population produces no Gold at all. Fixed
thresholds were tried first and were also wrong: they silently became
unreachable the moment the calibration was retuned. `scoreBusiness()`
deliberately never self-awards — an award is a claim about relative standing,
so awarding one to a business scored in isolation was exactly the astroturf
hole the design exists to close.

### Tuning

Everything lives in the `SCORING` object at the top of `assets/scoring.js`.
`test/scoring.test.js` simulates 300 businesses with realistically inflated
inputs and asserts the curve stays tight — if you change the prior, the axis
weights, or the calibration targets, run it and check the printed distribution.
The guard rails it enforces: under 5% above 4.00, the bulk in 3.0–3.75, and all
three award tiers still attainable.

### Not implemented: reviewer credibility weighting

Tabelog weighs established reviewers more heavily. That needs real reviewer
identity, and without accounts it would be theatre. The schema carries an inert
`reviewerWeight` field so it can be switched on the day a backend exists.

### Links out to Google and Yelp

Every listing carries lookup links to both platforms, built from the business
name and city:

```
https://www.google.com/maps/search/?api=1&query=<name>+<city>+WA
https://www.yelp.com/search?find_desc=<name>&find_loc=<city>,+WA
```

These are **searches, not verified deep links.** L&I publishes no Google Place
ID or Yelp business ID, and scraping either platform to obtain one would breach
their terms — so the label reads "Look up reviews" rather than "Reviews", and
the tooltip says to check the result is the right company. If a curated overlay
entry carries a confirmed URL, that exact link replaces the search and the label
switches to "Reviews".

Only counts and ratings are ever rendered from the overlay — **never review
text.** Republishing Google or Yelp review content violates both platforms'
terms; linking to them does not.

### Storage, and the backend switch

Reviews merge from three sources: the curated `REVIEWS` array in
`data/reviews.js` (the published source of truth), the visitor's own browser
(localStorage — scores live, but the UI states plainly that nobody else can see
it), and an optional HTTP backend.

To go live, set `REVIEW_BACKEND.url` and `acceptSubmissions: true` in
`data/reviews.js`. The endpoint needs `GET /reviews` returning
`{ reviews: [...] }` and `POST /reviews` accepting one review object, with CORS
headers for your Pages origin. Nothing else changes.

Until then the form saves locally and emits a commit-ready JSON snippet.

**Do not seed `REVIEWS` with invented entries.** A fabricated review about a
real, named local contractor is defamation with extra steps — and because of the
shrinkage above, faking a handful would not even move the score.

---

## Two things to understand before extending this

### 1. Filter on specialty **codes**, never descriptions

`data/categories.js` maps each trade to `specialtycode1` values like `CD`
(roofing) and `RE` (tile). Do not switch to matching `specialtycode1desc`.
Several descriptions in the source data carry stray whitespace —
`"Heating/Vent/Air-Conditioning and Refrig (HVAC/R) "` and
`"Wood/Pellet and Gas Stoves "` have trailing spaces,
`"Sanitation System  / Side sewers"` has a double space — so equality matching
on them silently returns zero rows. The two-character codes are stable and
comma-free.

Some codes are reused across license types (`01` is GENERAL for construction
contractors but JOURNEY LEVEL for electricians), which is why every category
also constrains `licenseTypes`.

### 2. The certification overlay ships empty on purpose

`data/certifications.js` has two parts:

- **`CERT_PROGRAMS`** — a populated reference table of ~45 real trade
  certifications (CTEF Certified Tile Installer, GAF Master Elite, NATE, ISA
  Certified Arborist, NARI, NKBA, NABCEP, EPA Lead-Safe…), each with what it
  means, a difficulty tier, and the certifying body's official
  verification directory. This drives the certification guide page and the
  per-trade hints.

- **`BUSINESS_CERTS`** — the overlay attaching certifications and review counts
  to *specific companies*. **This is intentionally empty.**

A certification badge is a claim about a named business. Publishing one that is
wrong or invented misleads a homeowner at exactly the moment they are deciding
who to trust with their house — so the file only accepts entries confirmed
against the certifying body's own directory, each recording the date checked and
the source URL.

To add one, verify via the program's `verifyUrl`, then append:

```js
{
  ubi: '603320569',                    // preferred key — survives name changes
  certs: [
    { key: 'ctef-cti', verified: '2026-08-16',
      source: 'https://www.ceramictilefoundation.org/...' }
  ],
  reviews: {
    google: { count: 412, rating: 4.8, checked: '2026-08-16', url: 'https://...' },
    yelp:   { count: 96,  rating: 4.5, checked: '2026-08-16', url: 'https://...' }
  }
}
```

Match on `ubi` or `license` — **never on business name.** Contractor names
collide constantly; a dozen unrelated companies share variations of
"NW Construction LLC".

Entries missing `verified` + `source` render as dashed "unverified" badges
rather than clean ones, so a half-finished entry can never masquerade as
confirmed.

---

## Known limitations

These are also stated on the site's *How this works* page, in plain language,
because a directory that hides its own weaknesses is worse than no directory.

- **Geography is approximate.** L&I records a *mailing city*, not a service
  area and not a county. A Tacoma-based roofer who works in Kent daily will not
  appear; a Seattle-registered company that only works in Everett will.
- **Only the primary specialty is matched.** The dataset can carry multiple
  specialty codes per contractor; filtering uses `specialtycode1`.
- **Bond amounts are small.** Washington requires $12,000 for general
  contractors, $6,000 for specialty. Against a real remodel budget that is close
  to symbolic, and claims may queue behind other homeowners.
- **Registry lag exists.** L&I's published extracts refresh periodically, so a
  very recent lapse may not appear. Every listing deep-links to the live
  official record, which is always the tiebreaker.
- **Rankings reflect this site only.** The state registry contains no reviews,
  so rankings come purely from reviews submitted here — a far smaller sample
  than the major platforms. A contractor absent from a ranking is almost
  certainly just unreviewed, not judged and found wanting.
- **Review counts start at zero.** The scoring engine is fully wired but has
  nothing to rank until reviews exist. This is deliberate; see above.

---

## License & disclaimer

Independent project. Not affiliated with, endorsed by, or operated by the
Washington State Department of Labor & Industries or King County.

Listings are generated automatically from public records and are **not**
endorsements or vetting of any company's work quality. Always re-verify at
[secure.lni.wa.gov/verify](https://secure.lni.wa.gov/verify/) before signing a
contract.
