import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { FEEDS } from '../../../lib/feeds';
import { scoreHeadline } from '../../../lib/scoring';
import { isRelevant } from '../../../lib/relevance';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby plan hard ceiling — cannot be raised

// Gemini call latency (not row count) is what actually limits a batch here,
// so this is a deadline, not a count. The check only runs *between* items, so
// the worst case isn't TIME_BUDGET_MS -- it's TIME_BUDGET_MS + one more full
// GEMINI_TIMEOUT_MS (see lib/scoring.js) for the item already in flight when
// the deadline was crossed: 3500+4500=8000ms, plus ~500ms overhead, leaves
// ~1.5s under the 10s wall.
const TIME_BUDGET_MS = 3500;
const BATCH_SIZE = 50;

const categoryBySource = Object.fromEntries(FEEDS.map((f) => [f.source, f.category]));

// One-off backlog clearer for rows stored before policy_relevance existed.
// On a 10s function ceiling, one call realistically only scores a handful of
// rows (however many Gemini calls fit before TIME_BUDGET_MS) — call this
// endpoint repeatedly (e.g. in a curl loop) until the response's `remaining`
// hits 0. Clearing a large backlog this way will take many invocations.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const provided = request.headers.get('authorization')?.replace('Bearer ', '') || url.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // Read-only diagnostic: ?checkColumns=1 tries to select the new columns
  // directly, to tell apart "column doesn't exist" from "PostgREST schema
  // cache is just stale" without guessing.
  if (new URL(request.url).searchParams.get('checkColumns')) {
    const { data, error } = await supabaseAdmin
      .from('headlines')
      .select('id, title, source, image_url, caption')
      .order('id', { ascending: false })
      .limit(5);
    return NextResponse.json({ ok: !error, error: error?.message ?? null, sample: data ?? null });
  }

  // Read-only diagnostic: ?stats=1 reports table-wide counts with no writes,
  // to check whether the backlog is genuinely shrinking or something else is
  // growing it back between calls (deleted:50 was reported on consecutive
  // calls even though remaining supposedly hadn't moved, which is impossible
  // if remaining were accurate and stable).
  if (new URL(request.url).searchParams.get('stats')) {
    const [{ count: total }, { count: nullCount }, { data: nullRows }] = await Promise.all([
      supabaseAdmin.from('headlines').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('headlines').select('id', { count: 'exact', head: true }).is('policy_relevance', null),
      supabaseAdmin.from('headlines').select('id, title, source').is('policy_relevance', null),
    ]);
    return NextResponse.json({ total, nullCount, nullRows });
  }

  // One-off cleanup: isRelevant() only gates *new* general-source headlines
  // before they're first scored, so rows scored before that filter existed
  // (or before a keyword list update) never get re-checked. This re-applies
  // isRelevant() to every already-scored general-source row and deletes the
  // ones that don't match. No Gemini calls involved, so no time-budget looping
  // needed -- one call handles the whole table.
  if (new URL(request.url).searchParams.get('cleanupRelevance')) {
    const generalSources = FEEDS.filter((f) => f.category === 'general').map((f) => f.source);
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('headlines')
      .select('id, title, source')
      .in('source', generalSources)
      .not('score', 'is', null);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const toDelete = rows.filter((row) => !isRelevant(row.title, 'general'));
    let deleted = 0;
    if (toDelete.length > 0) {
      const { data: deletedRows, error: deleteError } = await supabaseAdmin
        .from('headlines')
        .delete()
        .in('id', toDelete.map((row) => row.id))
        .select('id');
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
      deleted = deletedRows?.length ?? 0;
    }

    return NextResponse.json({ checked: rows.length, deleted, kept: rows.length - deleted });
  }

  const start = Date.now();

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from('headlines')
    .select('id, title, source')
    .is('policy_relevance', null)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let scored = 0;
  let deleted = 0;
  let noMatch = 0; // delete/update reported no error but matched 0 rows (stale id, already handled)
  let scoreFailed = 0; // write succeeded, but scoreHeadline() itself errored (still null policy_relevance)
  let stoppedReason = 'batch_complete';
  let lastScoreError = null;

  for (const row of rows) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      stoppedReason = 'time_budget';
      break;
    }

    const category = categoryBySource[row.source];
    if (!isRelevant(row.title, category)) {
      // .select() forces the actual affected row back so a 0-row match (id no
      // longer exists / already handled) isn't miscounted as a real delete.
      const { data: deletedRows, error: deleteError } = await supabaseAdmin
        .from('headlines')
        .delete()
        .eq('id', row.id)
        .select('id');
      if (deleteError) continue;
      if (!deletedRows || deletedRows.length === 0) {
        noMatch++;
      } else {
        deleted++;
      }
      continue;
    }

    const { score, policy_relevance, summary, caption } = await scoreHeadline(row.title);
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('headlines')
      .update({ score, policy_relevance, summary, caption })
      .eq('id', row.id)
      .select('id');
    if (updateError) continue;
    if (!updatedRows || updatedRows.length === 0) {
      noMatch++;
      continue;
    }

    if (policy_relevance === null || (summary && summary.startsWith('ERROR'))) {
      // The write succeeded, but scoreHeadline() itself errored (e.g. a
      // transient Gemini failure) and wrote back nulls — this row will keep
      // reappearing in the backlog query forever if counted as "scored".
      scoreFailed++;
      lastScoreError = summary;
    } else {
      scored++;
    }
  }

  const { count: remaining } = await supabaseAdmin
    .from('headlines')
    .select('id', { count: 'exact', head: true })
    .is('policy_relevance', null);

  return NextResponse.json({
    scored,
    deleted,
    noMatch,
    scoreFailed,
    ...(scoreFailed ? { lastScoreError } : {}),
    remaining: remaining ?? null,
    elapsedMs: Date.now() - start,
    stoppedReason,
  });
}
