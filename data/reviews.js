/* ==========================================================================
   Review store
   --------------------------------------------------------------------------
   Reviews come from up to three places, merged at page load:

     1. CURATED    — the `REVIEWS` array below, committed to the repo. This is
                     the source of truth and the only thing other visitors see.
     2. LOCAL      — reviews the current visitor has written in this browser,
                     held in localStorage. They score live so the system is
                     fully usable before any backend exists, but they are
                     visible only to the person who wrote them, and the UI
                     says so plainly rather than implying they were published.
     3. REMOTE     — an optional HTTP endpoint. Off by default. Set
                     REVIEW_BACKEND.url and the site fetches published reviews
                     from it and POSTs new ones there instead of localStorage.

   WHY IT SHIPS THIS WAY

   Anonymous public reviews of named local businesses are a genuinely
   different risk surface from restaurant reviews: a one-person roofing
   company can be materially harmed by a handful of fake one-star reviews
   from a competitor, and the operator of the site — not the anonymous
   poster — is the one who gets the letter. Curation keeps that under
   control while the directory is small, and the backend hook is there for
   when it is not.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------- backend */

const REVIEW_BACKEND = {
  /* Set to e.g. 'https://reviews.your-worker.workers.dev' to go live.
     The endpoint must support:
       GET  {url}/reviews            -> { reviews: [ ...review objects... ] }
       POST {url}/reviews            -> accepts one review object
     and must send CORS headers permitting your Pages origin. */
  url: null,
  /* When true, submissions POST to the backend. When false they are stored
     locally and the form emits a commit-ready JSON snippet instead. */
  acceptSubmissions: false
};

/* --------------------------------------------------------------- schema */

/*
  A review object:

  {
    ubi:      '603320569',      // REQUIRED. Ties the review to an L&I record.
                                // Match on UBI, never on business name —
                                // contractor names collide constantly.
    license:  'ABCDEF123AB',    // optional secondary key
    ratings: {                  // 1.0–5.0, half steps. Any axis may be omitted;
      workmanship:   4.5,       // omitted axes are excluded from the mean
      communication: 4.0,       // rather than counted as zero.
      schedule:      3.5,
      value:         4.0,
      conduct:       4.5,
      followup:      3.0
    },
    jobSize:    'midsize',      // 'repair' | 'midsize' | 'major'
    trade:      'roofing',      // category id, for per-trade calibration
    visitDate:  '2026-05-14',   // when the WORK happened, not when posted.
                                // Drives recency decay.
    evidence:   'named',        // 'verified' | 'named' | 'anonymous'
                                // 'verified' means you saw a permit number,
                                // invoice, or contract. It weights 1.5x, so
                                // do not apply it casually.
    title:      'Re-roof on a 1926 bungalow',
    body:       'Free text.',
    author:     'K. from Ballard',
    permit:     'BLD2026-01234', // optional, supports 'verified'
    reviewerWeight: 1            // reserved; inert until identity exists
  }
*/

const REVIEWS = [
  // Intentionally empty. Add verified, curated reviews here.
  //
  // Do NOT seed this with invented reviews to make the site look populated.
  // A fabricated review about a real, named local contractor is defamation
  // with extra steps, and the scoring engine is specifically designed so
  // that a small number of reviews cannot move a score much anyway — so
  // faking them would not even achieve the cosmetic goal.
];

/* ----------------------------------------------------------------- local */

const LOCAL_KEY = 'kcc-local-reviews-v1';

function loadLocalReviews() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveLocalReview(review) {
  const all = loadLocalReviews();
  all.push(Object.assign({ _local: true, _savedAt: new Date().toISOString() }, review));
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    return true;
  } catch (e) {
    return false;
  }
}

function deleteLocalReview(index) {
  const all = loadLocalReviews();
  all.splice(index, 1);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    return true;
  } catch (e) {
    return false;
  }
}

function clearLocalReviews() {
  try { localStorage.removeItem(LOCAL_KEY); return true; } catch (e) { return false; }
}

/* ----------------------------------------------------------------- merge */

let remoteReviews = [];

async function fetchRemoteReviews() {
  if (!REVIEW_BACKEND.url) return [];
  try {
    const res = await fetch(REVIEW_BACKEND.url.replace(/\/$/, '') + '/reviews', {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    remoteReviews = Array.isArray(data) ? data : (data.reviews || []);
    return remoteReviews;
  } catch (e) {
    return [];
  }
}

/** Every review the current visitor should be scored against. */
function allReviews() {
  return REVIEWS.concat(remoteReviews).concat(loadLocalReviews());
}

/** Index reviews by UBI for fast per-business lookup. */
function reviewsByUbi(list) {
  const idx = {};
  (list || allReviews()).forEach((r) => {
    const key = String(r.ubi || '').trim();
    if (!key) return;
    (idx[key] = idx[key] || []).push(r);
  });
  return idx;
}

async function submitReview(review) {
  if (REVIEW_BACKEND.url && REVIEW_BACKEND.acceptSubmissions) {
    const res = await fetch(REVIEW_BACKEND.url.replace(/\/$/, '') + '/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review)
    });
    if (!res.ok) throw new Error('Submission failed (HTTP ' + res.status + ')');
    return { mode: 'remote' };
  }
  const ok = saveLocalReview(review);
  if (!ok) throw new Error('Could not save locally — browser storage is full or blocked.');
  return { mode: 'local' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REVIEWS, REVIEW_BACKEND, allReviews, reviewsByUbi,
    loadLocalReviews, saveLocalReview, deleteLocalReview, clearLocalReviews,
    fetchRemoteReviews, submitReview
  };
}
