# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An editorial discovery engine: it pulls headlines from a fixed list of RSS/Atom feeds (local news + outdoor/hunting/conservation sites), uses Gemini to score each headline on "breakout potential" and "policy relevance," stores everything in Supabase, and emails a daily digest via Resend. The homepage (`app/page.js`) renders the most recent stored headlines per source — it reads only from Supabase, it does not fetch feeds live.

## Commands

- `npm run dev` — start the Next.js dev server
- `npm run build` — production build
- `npm run start` — run the production build
- No test suite, linter, or type checker is configured.

## Architecture

- **Next.js 14 App Router**, plain JS (no TypeScript). Routes:
  - `app/page.js` — server component homepage. Reads the 5 most recent headlines per feed source from the Supabase `headlines` table, sorted by `pub_date`.
  - `app/api/cron/route.js` — the daily pipeline. Triggered on a schedule (see `vercel.json`: daily at 13:00 UTC) via Vercel Cron hitting `GET /api/cron`. Deployed on Vercel's **Hobby plan, hard 10s function ceiling** (`maxDuration = 10`, cannot be raised without upgrading) — the whole handler is deadline-driven, not count-driven, because Gemini call latency (not a fixed item count) is what actually determines how much fits:
    1. Fetches + parses every feed in `lib/feeds.js` **concurrently** (`Promise.all`) with `rss-parser` (custom User-Agent header — several of these feeds block default UA strings). This has to be concurrent, not sequential — 9 external feeds fetched one at a time can burn the entire 10s budget on network latency alone before a single headline gets scored. The scoring loop that follows processes feeds in an order rotated daily (`rotateFeeds()`, based on day-of-epoch mod feed count) rather than `lib/feeds.js`'s fixed order — otherwise sources near the end of that list would starve every time earlier ones filled the whole scoring budget.
    2. For each feed's newest 10 items, skips any link already scored in Supabase (checks `score`/`policy_relevance` are non-null) and, for `category: 'general'` feeds, skips anything `isRelevant()` (`lib/relevance.js`) rules out as off-topic — those are never stored. Remaining candidates are scored with `scoreHeadline()` (`lib/scoring.js`) and upserted one at a time (immediately, not batched at the end) until `SCORING_DEADLINE_MS` (7s elapsed) is hit, at which point any unprocessed feeds/items are marked `skipped`/`partial` in the response rather than attempted. On a busy day this means most new headlines across all 9 feeds will *not* get scored same-day — they either get picked up on a later cron run (if still in that feed's latest-10) or need `/api/backfill` once they age out.
    3. Upserts scored rows into Supabase's `headlines` table on conflict `link` (so `link` is the dedup key across runs).
    4. If there's still budget left (`EMAIL_ATTEMPT_DEADLINE_MS`, 8.5s elapsed), re-reads the top 5 per source from Supabase and emails that digest via Resend to a hardcoded address; otherwise the email is skipped for that run.
    5. Returns a JSON summary (`ranAt`, `elapsedMs`, per-feed `results` with `scored`/`pending`/`errors`, `emailStatus`) — useful for manually curling the endpoint to debug a run.
  - `app/api/backfill/route.js` — one-off endpoint for backfilling rows that predate a newly-added scoring field (currently: rows with `policy_relevance IS NULL`). Same 10s ceiling and deadline-driven design as the cron route (`TIME_BUDGET_MS`, currently 8s) — realistically only a handful of rows get scored per call, so clearing any real backlog means calling this endpoint many times in a loop until the response's `remaining` hits 0. For each row it applies the same `isRelevant()` check as the cron route (looking up the row's feed category by `source`): irrelevant general-source rows are deleted rather than backfilled, everything else gets scored and updated in place. Optionally gated by `BACKFILL_SECRET` (checked against an `Authorization: Bearer` header or `?secret=` query param) — unset means the endpoint is open.
- **`lib/feeds.js`** — the single source of truth for which feeds are pulled. Each entry has `url`, `source` (used as the display name and Supabase key), and `category` (`general` / `outdoor` / `policy`). `category` drives the relevance filter: only `general` feeds are filtered, since `outdoor`/`policy` sources are on-topic by definition.
- **`lib/relevance.js`** — `isRelevant(title, category)`: keyword heuristic (no API call) that gates whether a `general`-category headline is worth scoring at all. Tune `OUTDOOR_KEYWORDS` to adjust what counts as on-topic.
- **`lib/scoring.js`** — `scoreHeadline(title)`: the shared Gemini call, used by both the cron and backfill routes. Prompts for strict JSON (`breakout_score`, `policy_relevance`, `summary`) and parses it; on any failure it returns `score: null` and puts the error message in `summary` (prefixed `ERROR:`) rather than throwing — the UI filters out summaries starting with `ERROR`.
- **`lib/supabaseClient.js`** — shared Supabase client. Reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY` from env (set in Vercel, not committed).
- **Supabase `headlines` table** (schema inferred from usage, not defined in-repo): columns include `id`, `title`, `link` (unique/conflict key), `source`, `pub_date`, `score`, `policy_relevance`, `summary`.
- Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `RESEND_API_KEY`, `GEMINI_API_KEY`. Optional: `BACKFILL_SECRET`.

## Notes for making changes

- To add/remove a feed, edit `lib/feeds.js` only.
- The homepage and the email digest both independently query Supabase for "top 5 per source by pub_date" — if you change that logic, update both `app/page.js` and the equivalent block in `app/api/cron/route.js`.
- Neither the cron route nor the backfill route requires auth unless `BACKFILL_SECRET` is set (which only gates backfill) — anyone with the cron URL can trigger a full scoring + email run.
- Both routes set `export const maxDuration = 10` to match the Vercel Hobby plan's hard ceiling. If you upgrade plans, raise this and the `*_DEADLINE_MS`/`TIME_BUDGET_MS` constants in each route together — they're deliberately kept a couple seconds under `maxDuration` for response/query overhead, not set to match it exactly.
