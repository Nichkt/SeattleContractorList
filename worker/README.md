# Review backend

A Cloudflare Worker + D1 database that accepts reviews, holds them for
moderation, and serves the approved ones to the site.

Free tier covers this comfortably: D1 gives 5 GB of storage and 5 million row
reads a day, and Workers give 100,000 requests a day. A directory of this size
will not come close.

---

## Before you deploy: what you are taking on

Turning this on changes what the site is. Right now it publishes public records
and links out. With submissions open it publishes **claims by strangers about
named local businesses**, many of them one or two people with a truck and a
mortgage.

Two consequences worth being clear-eyed about:

1. **You become the publisher.** In practice the person who runs the site is
   the one a contractor contacts — or sues — over a review they say is false.
   Not the anonymous author.
2. **Someone will try to game it.** A competitor leaving one-star reviews, or an
   owner leaving five-star ones. Both happen to every review site.

The design answers both, but neither answer is free:

- **Nothing publishes automatically.** Every submission lands as `pending` and
  only appears after you approve it. That is real, recurring work.
- **The scoring absorbs what slips through.** Shrinkage means a handful of
  reviews barely moves a score, so a moderation mistake cannot swing a ranking.

If you are not prepared to moderate, leave `ACCEPT_SUBMISSIONS = "false"`. The
site works perfectly well without it.

---

## Deploy

```bash
cd worker
npm install -g wrangler
wrangler login

# 1. Create the database
wrangler d1 create kcc-reviews
#    Copy the printed database_id into wrangler.toml

# 2. Create the tables
wrangler d1 execute kcc-reviews --file=./schema.sql --remote

# 3. Set the secrets (you will be prompted for each value)
wrangler secret put ADMIN_TOKEN   # a long random string; your moderation password
wrangler secret put IP_SALT       # any long random string; salts the IP hashes

# 4. Ship it
wrangler deploy
```

Wrangler prints your Worker URL. Put it in `data/reviews.js`:

```js
const REVIEW_BACKEND = {
  url: 'https://kcc-reviews.<you>.workers.dev',
  acceptSubmissions: true
};
```

Commit that, and the site starts reading and writing real reviews.

---

## Moderating

List what is waiting:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://kcc-reviews.<you>.workers.dev/admin/pending
```

Approve or reject one:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "decision": "approved"}' \
  https://kcc-reviews.<you>.workers.dev/admin/decide
```

`decision` is `approved` or `rejected`. Rejected rows stay in the table so you
have a record of what was submitted and what you did about it.

**What to look for when moderating.** Does it describe a specific job? Does the
work date look plausible? Is it about workmanship rather than the person? A
review that names an individual employee, alleges a crime, or reads like a
template is worth rejecting even if it might be true — you are deciding what to
publish, not what is true.

---

## What the API does

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/reviews` | none | Approved reviews only |
| `POST` | `/reviews` | none | Submit one; stored as `pending` |
| `GET` | `/admin/pending` | token | The moderation queue |
| `POST` | `/admin/decide` | token | Approve or reject |

### Protections built in

- **Strict validation.** UBI must be nine digits; ratings must be 1–5 on half
  steps; work dates must be real, not in the future, not before 1990. Unknown
  rating axes are dropped rather than stored.
- **Verified claims must be backed.** `evidence: "verified"` weighs 1.5×, so
  the API rejects it unless a permit or invoice reference is supplied.
  Otherwise it is a checkbox worth a 50% bonus.
- **Rate limits.** Five submissions per IP per day, and one per IP per
  business, so nobody can pile onto a single contractor.
- **IPs are hashed, never stored.** Salted SHA-256, enough to rate limit and
  not enough to build a picture of who reviewed whom.
- **Honeypot.** A hidden field people never see; anything that fills it is
  discarded.
- **CORS is an allow-list.** Only origins in `ALLOWED_ORIGIN` may call the API
  from a browser. Not `*` — that would let any site post on a visitor's behalf.
- **Pending text is never public.** Review bodies only leave the server once
  approved.

Validation is covered by `test/worker.test.js` (21 checks) which runs without
Cloudflare, since that logic is the only thing between a public form and a
database of claims about real businesses.

---

## Turning it off

Set `ACCEPT_SUBMISSIONS = "false"` in `wrangler.toml` and redeploy. Reads keep
working, writes stop. Faster than taking the Worker down, and it keeps the
already-approved reviews visible.
