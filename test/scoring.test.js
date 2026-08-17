/* Unit tests for the Tabelog-style scoring engine.
   Pure functions, no browser needed. Run: node test/scoring.test.js */

const S = require('../assets/scoring.js');
const { SCORING, scoreBusiness, scoreByJobSize, rankBusinesses,
        reviewComposite, recencyWeight, assignAwards } = S;

const NOW = Date.parse('2026-08-17T00:00:00Z');
const results = [];

function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: cond ? '' : String(extra || '') });
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);
}

/** Build a review with every axis set to the same value. */
function flat(value, opts) {
  const ratings = {};
  SCORING.AXES.forEach((a) => { ratings[a.key] = value; });
  return Object.assign({
    ratings: ratings,
    visitDate: '2026-06-01',
    evidence: 'named',
    jobSize: 'midsize'
  }, opts || {});
}

/* ------------------------------------------------------------- composite */

check('axis weights sum to 1.0',
  near(SCORING.AXES.reduce((s, a) => s + a.weight, 0), 1.0, 1e-9),
  SCORING.AXES.reduce((s, a) => s + a.weight, 0));

check('flat 5.0 review composites to 5.0',
  near(reviewComposite(flat(5)), 5.0));

check('flat 1.0 review composites to 1.0',
  near(reviewComposite(flat(1)), 1.0));

// Missing axes must renormalise, not count as zero.
const partial = { ratings: { workmanship: 5, communication: 5 } };
check('missing axes renormalise instead of counting as zero',
  near(reviewComposite(partial), 5.0), reviewComposite(partial));

check('review with no ratings returns null', reviewComposite({ ratings: {} }) === null);

// Workmanship should dominate.
const wmHigh = { ratings: { workmanship: 5, communication: 1, schedule: 1, value: 1, conduct: 1, followup: 1 } };
const wmLow  = { ratings: { workmanship: 1, communication: 5, schedule: 5, value: 5, conduct: 5, followup: 5 } };
check('workmanship carries the most weight',
  reviewComposite(wmHigh) > 1.5 && reviewComposite(wmLow) < 4.5,
  reviewComposite(wmHigh) + ' / ' + reviewComposite(wmLow));

/* --------------------------------------------------------------- decay */

check('a review dated today has full recency weight',
  near(recencyWeight('2026-08-17', NOW), 1.0, 0.01),
  recencyWeight('2026-08-17', NOW));

check('a four-year-old review has half weight',
  near(recencyWeight('2022-08-17', NOW), 0.5, 0.01),
  recencyWeight('2022-08-17', NOW));

check('very old reviews floor rather than vanish',
  near(recencyWeight('1998-01-01', NOW), SCORING.MIN_RECENCY_WEIGHT, 0.001),
  recencyWeight('1998-01-01', NOW));

/* ------------------------------------------------- the Tabelog curve */

const one5 = scoreBusiness([flat(5, { visitDate: '2026-08-17' })], { now: NOW });
check('ONE five-star review yields ~3.46, not 5.00',
  near(one5.score, 3.46, 0.02), one5 && one5.score);

check('a single review is marked provisional', one5.provisional === true);
check('a provisional business gets no award tier', one5.tier === null, one5.tier);

const ten4 = scoreBusiness(
  Array.from({ length: 10 }, () => flat(4, { visitDate: '2026-08-17' })), { now: NOW });
check('ten four-star reviews yield ~3.70',
  near(ten4.score, 3.70, 0.02), ten4.score);

// Awards are population-relative by construction. A business scored on its
// own must never award itself — that was the astroturf hole: three glowing
// reviews scored in isolation cleared an absolute Gold threshold.
const three5 = scoreBusiness(
  Array.from({ length: 3 }, () => flat(5, { visitDate: '2026-08-17' })), { now: NOW });
check('a business scored in isolation is never self-awarded',
  three5.tier === null && ten4.tier === null, three5.tier + ' / ' + ten4.tier);

// In a real population, three perfect reviews must not outrank a business
// with a long, consistently strong history.
const astroturf = { name: 'Astroturf', rating: three5 };
const established = { name: 'Established', rating: scoreBusiness(
  Array.from({ length: 40 }, () => flat(4.5, { visitDate: '2026-08-17' })), { now: NOW }) };
const filler = Array.from({ length: 60 }, (_, i) => ({
  name: 'Filler' + i,
  rating: scoreBusiness(Array.from({ length: 6 }, () => flat(3, { visitDate: '2026-08-17' })), { now: NOW })
}));
const pop = [astroturf, established].concat(filler);
assignAwards(pop);
check('a long strong history outranks a three-review spike',
  established.rating.score > astroturf.rating.score,
  established.rating.score + ' vs ' + astroturf.rating.score);
check('the established business takes Gold, not the spike',
  established.rating.tier === 'gold' && astroturf.rating.tier !== 'gold',
  established.rating.tier + ' / ' + astroturf.rating.tier);

// A handful of bad reviews should not annihilate a business either.
const oneBad = scoreBusiness([flat(1, { visitDate: '2026-08-17' })], { now: NOW });
check('one terrible review shrinks upward toward the prior, not to 1.0',
  oneBad.score > 2.8 && oneBad.score < 3.2, oneBad.score);

check('score is reported to two decimals',
  Number.isFinite(one5.score) && String(one5.score).split('.')[1].length <= 2,
  one5.score);

check('raw (unshrunk) mean is exposed for transparency',
  near(one5.rawMean, 5.0, 0.01), one5.rawMean);

/* ---------------------------------------------------------- evidence */

const verified = scoreBusiness([flat(5, { evidence: 'verified', visitDate: '2026-08-17' })], { now: NOW });
const anon = scoreBusiness([flat(5, { evidence: 'anonymous', visitDate: '2026-08-17' })], { now: NOW });
check('a verified review moves the score more than an anonymous one',
  verified.score > anon.score, verified.score + ' vs ' + anon.score);

/* -------------------------------------------------------------- axes */

const mixed = scoreBusiness(Array.from({ length: 10 }, () => ({
  ratings: { workmanship: 5, communication: 2, schedule: 4, value: 3, conduct: 5, followup: 2 },
  visitDate: '2026-08-17', evidence: 'named'
})), { now: NOW });
check('per-axis breakdown is produced for every axis',
  SCORING.AXES.every((a) => typeof mixed.axes[a.key] === 'number'),
  JSON.stringify(mixed.axes));
check('axis breakdown is shrunk on the same terms as the headline',
  mixed.axes.workmanship < 5.0 && mixed.axes.workmanship > 3.2,
  mixed.axes.workmanship);
check('a weak axis lands below the prior',
  mixed.axes.communication < 3.2, mixed.axes.communication);

/* ------------------------------------------------------------ empty */

check('no reviews returns null rather than a fabricated score',
  scoreBusiness([]) === null && scoreBusiness(null) === null);
check('reviews with no usable ratings return null',
  scoreBusiness([{ ratings: {} }]) === null);

/* ---------------------------------------------------------- job size */

const bandReviews = []
  .concat(Array.from({ length: 5 }, () => flat(5, { jobSize: 'repair', visitDate: '2026-08-17' })))
  .concat(Array.from({ length: 2 }, () => flat(2, { jobSize: 'major', visitDate: '2026-08-17' })));
const bands = scoreByJobSize(bandReviews, { now: NOW });
check('a job-size band with enough reviews gets a score',
  bands.repair && bands.repair.count === 5, JSON.stringify(bands.repair));
check('a thin job-size band is suppressed rather than shown as n=2',
  bands.major === null, JSON.stringify(bands.major));

/* ---------------------------------------------------------- ranking */

const entries = [
  { name: 'High',        rating: scoreBusiness(Array.from({ length: 12 }, () => flat(5, { visitDate: '2026-08-17' })), { now: NOW }) },
  { name: 'Mid',         rating: scoreBusiness(Array.from({ length: 12 }, () => flat(4, { visitDate: '2026-08-17' })), { now: NOW }) },
  { name: 'Provisional', rating: scoreBusiness([flat(5, { visitDate: '2026-08-17' })], { now: NOW }) },
  { name: 'Unrated',     rating: null }
];
const ranked = rankBusinesses(entries);
check('ranking excludes provisional and unrated businesses',
  ranked.length === 2, JSON.stringify(ranked.map((r) => r.name)));
check('ranking is ordered by score descending',
  ranked[0].name === 'High' && ranked[1].name === 'Mid',
  JSON.stringify(ranked.map((r) => r.name)));
check('ranking honours a limit', rankBusinesses(entries, 1).length === 1);

/* ------------------------------------------------- distribution shape */

// Realistic population: contractor quality is roughly normal, and reviewers
// rate GENEROUSLY. This simulates the inflated inputs the site will actually
// receive (mean ~4.5) and checks that calibration keeps the curve tight.
function rnd(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }
const rand = rnd(42);
function normal() { return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand()); }

const businesses = [];
const allReviews = [];
for (let i = 0; i < 300; i++) {
  // True quality, normally distributed, expressed on an inflated 1-5 scale.
  const quality = Math.min(5, Math.max(1, 4.5 + normal() * 0.45));
  const n = 1 + Math.floor(Math.abs(normal()) * 8);
  const revs = Array.from({ length: n }, () => {
    const noisy = Math.min(5, Math.max(1, quality + normal() * 0.25));
    return flat(Math.round(noisy * 2) / 2, { visitDate: '2026-08-17' });
  });
  businesses.push(revs);
  revs.forEach((r) => allReviews.push(r));
}

const rawMeanAll = allReviews.reduce((s, r) => s + reviewComposite(r), 0) / allReviews.length;
check('simulated inputs are inflated, like real review data',
  rawMeanAll > 4.2, rawMeanAll.toFixed(2));

// WITHOUT calibration the scale collapses upward.
const uncal = businesses.map((revs) => scoreBusiness(revs, { now: NOW }));
const distUncal = S.distribution(uncal);
check('without calibration, inflated inputs push too many past 4.00',
  distUncal['4.0+'] / uncal.length > 0.15,
  (distUncal['4.0+'] / uncal.length * 100).toFixed(1) + '%');

// WITH calibration the Tabelog curve is restored.
const cal = S.computeCalibration(allReviews, { now: NOW });
check('calibration engages on a large enough sample', cal.applied === true);
check('calibration recentres the population downward',
  cal.mean > 4.0, cal.mean && cal.mean.toFixed(2));

const sim = businesses.map((revs) => scoreBusiness(revs, { now: NOW, calibration: cal }));
const dist = S.distribution(sim);
const above4 = dist['4.0+'];
check('with calibration, under 5% of businesses exceed 4.00',
  above4 / sim.length < 0.05, (above4 / sim.length * 100).toFixed(1) + '%');
const mid = dist['3.0\u20133.24'] + dist['3.25\u20133.49'] + dist['3.5\u20133.74'];
check('the bulk of the distribution sits in the 3.0-3.75 band',
  mid / sim.length > 0.55, (mid / sim.length * 100).toFixed(1) + '%');

// The regression that motivated linear calibration: a mean-only rescale
// squashes variance and makes every award tier unreachable.
const simEntries = sim.filter(Boolean).map((r, i) => ({ name: 'B' + i, rating: r }));
S.assignAwards(simEntries);
const tiers = simEntries.map((e) => e.rating.tier);
check('Bronze remains attainable after calibration',
  tiers.filter((t) => t === 'bronze').length > 0,
  JSON.stringify(S.distribution(sim)));
check('Silver remains attainable after calibration',
  tiers.filter((t) => t === 'silver').length > 0, 'none reached silver');
check('Gold stays rare — at most ~1% of the population',
  tiers.filter((t) => t === 'gold').length / sim.length <= 0.02 &&
  tiers.filter((t) => t === 'gold').length > 0,
  tiers.filter((t) => t === 'gold').length + ' of ' + sim.length);
check('awards are strictly ordered gold < silver < bronze by count',
  tiers.filter((t) => t === 'gold').length < tiers.filter((t) => t === 'silver').length &&
  tiers.filter((t) => t === 'silver').length < tiers.filter((t) => t === 'bronze').length,
  JSON.stringify({ g: tiers.filter((t) => t === 'gold').length,
                   s: tiers.filter((t) => t === 'silver').length,
                   b: tiers.filter((t) => t === 'bronze').length }));
check('no provisional business ever receives an award',
  simEntries.every((e) => !(e.rating.provisional && e.rating.tier)), 'provisional got an award');
check('assignAwards is idempotent',
  (function () {
    const before = simEntries.map((e) => e.rating.tier).join(',');
    S.assignAwards(simEntries);
    return simEntries.map((e) => e.rating.tier).join(',') === before;
  })(), 're-running changed the awards');
check('spread is preserved, not flattened',
  Math.max.apply(null, sim.filter(Boolean).map((r) => r.score)) -
  Math.min.apply(null, sim.filter(Boolean).map((r) => r.score)) > 0.8,
  'range too narrow');

check('calibration is inert on a sample too small to trust',
  S.computeCalibration(allReviews.slice(0, 5), { now: NOW }).applied === false);
check('an inert calibration leaves values untouched',
  S.applyCalibration(4.2, { applied: false }) === 4.2);

/* ------------------------------------------------------------ report */

let failed = 0;
console.log('\n--- scoring engine ---');
results.forEach((r) => {
  if (!r.pass) failed++;
  console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name +
    (r.extra ? '\n         got: ' + r.extra.slice(0, 200) : ''));
});
console.log('\ndistribution of 200 simulated businesses:');
Object.keys(dist).forEach((k) => console.log('  ' + k.padEnd(10) + dist[k]));
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
