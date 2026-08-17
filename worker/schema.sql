-- Review store for the King County Contractor Directory.
-- Apply with:  wrangler d1 execute kcc-reviews --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ubi           TEXT    NOT NULL,          -- ties the review to the L&I record
  license       TEXT,
  business_name TEXT,
  trade         TEXT,
  ratings       TEXT    NOT NULL,          -- JSON: { workmanship: 4.5, ... }
  job_size      TEXT,
  visit_date    TEXT    NOT NULL,          -- when the WORK happened
  evidence      TEXT    NOT NULL DEFAULT 'named',
  permit        TEXT,
  author        TEXT,
  title         TEXT,
  body          TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  ip_hash       TEXT,                      -- salted hash, for rate limiting only
  created_at    TEXT    NOT NULL,
  decided_at    TEXT
);

-- The public feed only ever reads approved rows.
CREATE INDEX IF NOT EXISTS idx_reviews_status  ON reviews (status, created_at DESC);
-- Rate limiting looks up by hashed IP, and by IP + business.
CREATE INDEX IF NOT EXISTS idx_reviews_ip      ON reviews (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_ip_ubi  ON reviews (ip_hash, ubi);
CREATE INDEX IF NOT EXISTS idx_reviews_ubi     ON reviews (ubi);
