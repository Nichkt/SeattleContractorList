/* ==========================================================================
   Tabelog-style scoring engine
   --------------------------------------------------------------------------
   Tabelog's defining characteristic is not its 1.00–5.00 range — it is how
   hard that range is to climb. Most restaurants sit between 3.0 and 3.5, a
   3.5 is genuinely good, and 4.0+ is roughly the top one percent. That
   compression is deliberate, and it is what makes the number informative:
   a scale where everyone scores 4.7 carries no signal at all.

   Two mechanisms produce it here.

   1. BAYESIAN SHRINKAGE toward a prior mean. A business's score is pulled
      toward the trade average until it accumulates enough review weight to
      earn its way out. One glowing five-star review moves a contractor to
      about 3.46 — not 5.00. This is the single most important property of
      the system: it makes the score unspoofable by a handful of reviews,
      which for contractor reviews (where a business owner's cousin is the
      obvious attack) matters more than it does for restaurants.

   2. RECENCY DECAY. A review from six years ago describes a company that
      may no longer employ any of the same people. Weight halves every four
      years, with a floor so old reviews still count for something.

   Deliberately NOT implemented: reviewer credibility weighting. Tabelog
   weighs established reviewers more heavily, which is its main defense
   against astroturfing — but that requires real reviewer identity. Without
   accounts it would be theater. The schema carries a `reviewerWeight` field
   so it can be switched on the day a backend exists.

   Pure functions, no DOM. Also loadable in Node for tests.
   ========================================================================== */

'use strict';

const SCORING = {
  /* The six axes a contractor is rated on, and how much each matters to the
     headline number. Workmanship dominates because it is the thing that is
     expensive and slow to fix; follow-up is weighted equal to communication
     because warranty behaviour is where most real complaints originate. */
  AXES: [
    { key: 'workmanship',   label: 'Workmanship',    weight: 0.30,
      help: 'Was the work done right, and will it last?' },
    { key: 'communication', label: 'Communication',  weight: 0.15,
      help: 'Did they return calls and tell you straight when something went wrong?' },
    { key: 'schedule',      label: 'Schedule',       weight: 0.15,
      help: 'Did they start and finish when they said they would?' },
    { key: 'value',         label: 'Value',          weight: 0.15,
      help: 'A fair price for the work, which is different from a cheap one.' },
    { key: 'conduct',       label: 'Site conduct',   weight: 0.10,
      help: 'Did the crew look after your property and clean up?' },
    { key: 'followup',      label: 'Follow-up',      weight: 0.15,
      help: 'Did they finish the punch list and stand behind the warranty?' }
  ],

  /* Prior. PRIOR_STRENGTH is expressed in units of review-weight: a value of
     6 means a business needs roughly six full-weight reviews before its own
     history outweighs the prior. */
  PRIOR_MEAN: 3.20,
  PRIOR_STRENGTH: 6,

  /* Recency. */
  HALF_LIFE_YEARS: 4,
  MIN_RECENCY_WEIGHT: 0.25,

  /* Evidence multipliers. A review backed by a permit number or invoice is
     worth more than an unbacked one; a fully anonymous review is worth less. */
  EVIDENCE_WEIGHT: { verified: 1.5, named: 1.0, anonymous: 0.7 },

  /* Below this many reviews a score is shown as provisional. */
  PROVISIONAL_BELOW: 3,

  /* Award tiers.
     These are PERCENTILE-based, not fixed score cutoffs. That mirrors how
     Tabelog works in practice — its Award and Hyakumeiten lists are explicit
     top-N selections, not "everyone above 3.5". It is also the only stable
     choice here: a fixed cutoff silently becomes unreachable the moment the
     calibration is retuned, which is exactly the bug this replaced.
     `min` is a floor, not the criterion — it stops awards being handed out
     in a population that is uniformly mediocre. */
  TIERS: [
    { key: 'gold',   label: 'Gold',   quantile: 0.01, min: 3.40 },
    { key: 'silver', label: 'Silver', quantile: 0.05, min: 3.30 },
    { key: 'bronze', label: 'Bronze', quantile: 0.15, min: 3.20 }
  ],

  /* Job-size bands. Recorded on every review and filterable, but NOT split
     into separate scores by default — on sparse data that yields n=1 per
     band, which is worse than no breakdown. See scoreByJobSize(). */
  JOB_SIZES: [
    { key: 'repair',  label: 'A repair or small job', hint: 'under about $5k' },
    { key: 'midsize', label: 'A mid-size project',   hint: 'about $5k to $50k' },
    { key: 'major',   label: 'A major remodel',      hint: 'over about $50k' }
  ],

  /* Minimum reviews in a band before a per-band score is shown at all. */
  JOB_SIZE_MIN: 4,

  /* Calibration targets. The population of review composites is linearly
     mapped so its mean lands on CAL_TARGET_MEAN and its spread on
     CAL_TARGET_SD. The spread target matters as much as the mean: rescaling
     by mean alone squashes variance too, and a scale where nobody can reach
     3.5 is exactly as useless as one where everybody scores 4.7. */
  CAL_TARGET_MEAN: 3.20,
  CAL_TARGET_SD: 0.60,
  CAL_MIN_SAMPLE: 30
};

const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

/* --------------------------------------------------------------- helpers */

function axisByKey(key) {
  return SCORING.AXES.find((a) => a.key === key) || null;
}

function clampRating(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return Math.min(5, Math.max(1, n));
}

/**
 * Composite rating for a single review: the weighted mean of whatever axes
 * the reviewer filled in. Axes left blank are excluded rather than
 * treated as zero, and the remaining weights are renormalised — otherwise a
 * reviewer who skips one question silently tanks the business.
 */
function reviewComposite(review) {
  if (!review || !review.ratings) return null;
  let sum = 0;
  let weight = 0;
  SCORING.AXES.forEach((axis) => {
    const r = clampRating(review.ratings[axis.key]);
    if (r === null) return;
    sum += r * axis.weight;
    weight += axis.weight;
  });
  if (weight === 0) return null;
  return sum / weight;
}

/** Recency multiplier: halves every HALF_LIFE_YEARS, floored. */
function recencyWeight(dateStr, now) {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return SCORING.MIN_RECENCY_WEIGHT;
  const years = Math.max(0, ((now || Date.now()) - t) / MS_PER_YEAR);
  const w = Math.pow(0.5, years / SCORING.HALF_LIFE_YEARS);
  return Math.max(SCORING.MIN_RECENCY_WEIGHT, Math.min(1, w));
}

/** Total weight a single review contributes. */
function reviewWeight(review, now) {
  const evidence = SCORING.EVIDENCE_WEIGHT[review.evidence] !== undefined
    ? SCORING.EVIDENCE_WEIGHT[review.evidence]
    : SCORING.EVIDENCE_WEIGHT.named;
  // reviewerWeight is reserved for a future identity-backed system; it
  // defaults to 1 and is intentionally inert today.
  const reviewer = typeof review.reviewerWeight === 'number'
    ? review.reviewerWeight : 1;
  return recencyWeight(review.visitDate || review.date, now) * evidence * reviewer;
}

/**
 * Bayesian-shrunk mean. This is the heart of the whole system.
 *
 *   score = (priorStrength * priorMean + Σ wᵢrᵢ) / (priorStrength + Σ wᵢ)
 *
 * With the default prior, a single 5.00 review yields 3.46; ten reviews
 * averaging 4.00 yield 3.70. Climbing past 4.00 requires both excellence
 * and volume, which is exactly the intended difficulty curve.
 */
function shrink(weightedSum, weightTotal, priorMean, priorStrength) {
  const m = priorMean === undefined ? SCORING.PRIOR_MEAN : priorMean;
  const c = priorStrength === undefined ? SCORING.PRIOR_STRENGTH : priorStrength;
  return (c * m + weightedSum) / (c + weightTotal);
}

/* ----------------------------------------------------------- calibration */

/**
 * Empirical calibration.
 *
 * Tabelog's tight curve is partly cultural: its reviewers genuinely treat 3
 * as "good". Western home-services reviews do the opposite — contractor
 * ratings on the big platforms cluster around 4.5-4.7, because anything less
 * than five stars feels like an insult to someone you met and shook hands
 * with. Feeding those inputs into a fixed prior would push every established
 * business past 4.00 and collapse the scale into the uselessness it exists
 * to avoid.
 *
 * So the population of review composites is mapped LINEARLY onto the target
 * distribution:
 *
 *   calibrated = targetMean + (raw - observedMean) * (targetSd / observedSd)
 *
 * Both halves matter. Correcting the mean alone — simply multiplying every
 * score by targetMean/observedMean — drags the centre down but compresses
 * the spread by the same factor, leaving every business bunched around 3.2
 * with the award tiers mathematically unreachable. Rescaling the spread as
 * well recentres the population while preserving the discrimination between
 * a genuinely excellent contractor and a merely adequate one, which is the
 * entire point of scoring them.
 *
 * Returns an inert calibration until the sample is large enough to estimate
 * a mean and spread honestly.
 */
function computeCalibration(allReviews, options) {
  const opts = options || {};
  const now = opts.now || Date.now();
  const targetMean = opts.targetMean === undefined ? SCORING.CAL_TARGET_MEAN : opts.targetMean;
  const targetSd = opts.targetSd === undefined ? SCORING.CAL_TARGET_SD : opts.targetSd;
  const minSample = opts.minSample === undefined ? SCORING.CAL_MIN_SAMPLE : opts.minSample;

  const inert = { applied: false, mean: targetMean, scale: 1, targetMean: targetMean };

  const usable = (allReviews || []).filter((r) => reviewComposite(r) !== null);
  if (usable.length < minSample) return inert;

  let sum = 0;
  let weight = 0;
  usable.forEach((r) => {
    const w = reviewWeight(r, now);
    sum += reviewComposite(r) * w;
    weight += w;
  });
  if (weight === 0) return inert;
  const mean = sum / weight;

  let varSum = 0;
  usable.forEach((r) => {
    const w = reviewWeight(r, now);
    const d = reviewComposite(r) - mean;
    varSum += d * d * w;
  });
  const sd = Math.sqrt(varSum / weight);

  // A degenerate spread (everyone rated identically) carries no information
  // to stretch, so fall back to a pure recentre.
  if (!isFinite(sd) || sd < 0.05) {
    return { applied: true, mean: mean, scale: 1, targetMean: targetMean };
  }

  // Clamp the stretch so a small or freakish sample cannot invert or wildly
  // amplify the scale.
  const scale = Math.max(0.4, Math.min(2.5, targetSd / sd));
  return { applied: true, mean: mean, scale: scale, targetMean: targetMean, sd: sd };
}

/** Apply a calibration produced by computeCalibration() to a single value. */
function applyCalibration(value, cal) {
  if (value === null) return null;
  if (!cal || !cal.applied) return value;
  const mapped = cal.targetMean + (value - cal.mean) * cal.scale;
  return Math.min(5, Math.max(1, mapped));
}

/* ----------------------------------------------------------------- score */

/**
 * Score one business from its reviews.
 *
 * Returns null when there are no usable reviews — callers should render
 * "not yet rated" rather than inventing a number. An unrated business is a
 * fact about our data, not a judgement about the contractor.
 */
function scoreBusiness(reviews, options) {
  const opts = options || {};
  const now = opts.now || Date.now();
  const priorMean = opts.priorMean;

  const cal = opts.calibration || null;

  const usable = (reviews || []).filter((r) => reviewComposite(r) !== null);
  if (!usable.length) return null;

  let weightedSum = 0;
  let weightTotal = 0;

  // Per-axis accumulators, so the breakdown is shrunk on the same terms as
  // the headline number rather than being a raw average that contradicts it.
  const axisAcc = {};
  SCORING.AXES.forEach((a) => { axisAcc[a.key] = { sum: 0, weight: 0 }; });

  usable.forEach((r) => {
    const composite = applyCalibration(reviewComposite(r), cal);
    const w = reviewWeight(r, now);
    weightedSum += composite * w;
    weightTotal += w;

    SCORING.AXES.forEach((axis) => {
      const v = applyCalibration(clampRating(r.ratings[axis.key]), cal);
      if (v === null) return;
      axisAcc[axis.key].sum += v * w;
      axisAcc[axis.key].weight += w;
    });
  });

  const score = shrink(weightedSum, weightTotal, priorMean);

  const axes = {};
  SCORING.AXES.forEach((axis) => {
    const acc = axisAcc[axis.key];
    axes[axis.key] = acc.weight > 0
      ? shrink(acc.sum, acc.weight, priorMean)
      : null;
  });

  // The unshrunk average, kept for transparency on the detail view. Showing
  // people both numbers is how the ranking stays trustworthy — it makes the
  // adjustment visible instead of feeling like a black box.
  const rawMean = weightedSum / weightTotal;

  return {
    score: round2(score),
    rawMean: round2(rawMean),
    count: usable.length,
    weight: Math.round(weightTotal * 100) / 100,
    provisional: usable.length < SCORING.PROVISIONAL_BELOW,
    tier: null, // awards are population-relative; see assignAwards()
    axes: axes,
    lastReviewed: usable
      .map((r) => r.visitDate || r.date)
      .sort()
      .pop() || null
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Assign award tiers across a whole population by percentile.
 *
 * Entries are `{ rating }` objects as produced by scoreBusiness(); the tier
 * is written back onto each rating. Provisional and unrated businesses are
 * excluded from both the ranking and the percentile base, so a flood of
 * one-review businesses cannot dilute the cohort and make awards easier to
 * win.
 *
 * Each tier also has to clear its `min` floor, so a weak population simply
 * produces no Gold rather than crowning whoever is least bad.
 */
function assignAwards(entries, options) {
  const opts = options || {};
  const eligible = (entries || [])
    .filter((e) => e && e.rating && !e.rating.provisional)
    .sort((a, b) =>
      b.rating.score - a.rating.score ||
      b.rating.weight - a.rating.weight);

  // Clear any fallback tier first so re-running is idempotent.
  (entries || []).forEach((e) => { if (e && e.rating) e.rating.tier = null; });

  const n = eligible.length;
  if (!n) return entries;

  let cursor = 0;
  SCORING.TIERS.forEach((tier) => {
    const cutoff = Math.max(1, Math.round(n * tier.quantile));
    while (cursor < cutoff && cursor < n) {
      const entry = eligible[cursor];
      if (entry.rating.score >= tier.min) entry.rating.tier = tier.key;
      cursor++;
    }
  });

  return entries;
}

/**
 * Per-job-size breakdown, returned only for bands with enough reviews to
 * say anything honest. A roofer who is excellent on repairs and poor on full
 * re-roofs is a real and common pattern — but it takes volume to detect, and
 * a band with one review detects nothing.
 */
function scoreByJobSize(reviews, options) {
  const out = {};
  SCORING.JOB_SIZES.forEach((band) => {
    const subset = (reviews || []).filter((r) => r.jobSize === band.key);
    if (subset.length < SCORING.JOB_SIZE_MIN) { out[band.key] = null; return; }
    out[band.key] = scoreBusiness(subset, options);
  });
  return out;
}

/**
 * Rank businesses for the per-trade top lists. Sorts by score, breaking ties
 * with review weight so that, between two equal scores, the better-evidenced
 * one leads. Provisional entries are excluded from rankings entirely.
 */
function rankBusinesses(entries, limit) {
  const ranked = (entries || [])
    .filter((e) => e.rating && !e.rating.provisional)
    .sort((a, b) =>
      b.rating.score - a.rating.score ||
      b.rating.weight - a.rating.weight ||
      String(a.name).localeCompare(String(b.name)));
  return typeof limit === 'number' ? ranked.slice(0, limit) : ranked;
}

/**
 * Distribution summary, used to sanity-check that the curve stays Tabelog-
 * shaped as real reviews accumulate. If most businesses drift above 3.6 the
 * prior needs retuning — see README.
 */
function distribution(ratings) {
  const buckets = { '<3.0': 0, '3.0–3.24': 0, '3.25–3.49': 0, '3.5–3.74': 0, '3.75–3.99': 0, '4.0+': 0 };
  (ratings || []).forEach((r) => {
    if (!r) return;
    const s = r.score;
    if (s < 3.0) buckets['<3.0']++;
    else if (s < 3.25) buckets['3.0–3.24']++;
    else if (s < 3.5) buckets['3.25–3.49']++;
    else if (s < 3.75) buckets['3.5–3.74']++;
    else if (s < 4.0) buckets['3.75–3.99']++;
    else buckets['4.0+']++;
  });
  return buckets;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCORING, scoreBusiness, scoreByJobSize, rankBusinesses, distribution,
    reviewComposite, reviewWeight, recencyWeight, shrink, axisByKey,
    computeCalibration, applyCalibration, assignAwards
  };
}
