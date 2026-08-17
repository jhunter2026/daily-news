import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { FEEDS } from '../../../lib/feeds';
import { scoreHeadline } from '../../../lib/scoring';
import { isRelevant } from '../../../lib/relevance';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby plan hard ceiling — cannot be raised

// Gemini call latency (not row count) is what actually limits a batch here,
// so this is a deadline, not a count. Leaves ~2s headroom under the 10s hard
// wall for the initial fetch, the final "remaining" count query, and the
// response itself.
const TIME_BUDGET_MS = 8000;
const BATCH_SIZE = 50;

const categoryBySource = Object.fromEntries(FEEDS.map((f) => [f.source, f.category]));

// One-off backlog clearer for rows stored before policy_relevance existed.
// On a 10s function ceiling, one call realistically only scores a handful of
// rows (however many Gemini calls fit before TIME_BUDGET_MS) — call this
// endpoint repeatedly (e.g. in a curl loop) until the response's `remaining`
// hits 0. Clearing a large backlog this way will take many invocations.
export async function GET(request) {
  const secret = process.env.BACKFILL_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const provided = request.headers.get('authorization')?.replace('Bearer ', '') || url.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // Read-only diagnostic: ?peek=<id> returns that row's current DB state with
  // no writes, so we can check whether a previously-fixed row silently
  // reverts later without spending any more Gemini calls to find out.
  const peekId = new URL(request.url).searchParams.get('peek');
  if (peekId) {
    const { data: peekRow, error: peekError } = await supabase
      .from('headlines')
      .select('*')
      .eq('id', peekId)
      .single();
    return NextResponse.json({ peekId, peekRow, peekError: peekError?.message ?? null });
  }

  const start = Date.now();

  const { data: rows, error: fetchError } = await supabase
    .from('headlines')
    .select('id, title, source')
    .is('policy_relevance', null)
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let scored = 0;
  let deleted = 0;
  let blocked = 0; // write reported no error but affected 0 rows (RLS silently denying it)
  let scoreFailed = 0; // write succeeded, but scoreHeadline() itself errored (still null policy_relevance)
  let stoppedReason = 'batch_complete';
  let lastBlockedDetail = null;
  let lastScoreError = null;
  const debug = []; // temporary: proves whether a "scored" write actually persists

  for (const row of rows) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      stoppedReason = 'time_budget';
      break;
    }

    const category = categoryBySource[row.source];
    if (!isRelevant(row.title, category)) {
      // .select() forces PostgREST to return the affected rows, so we can tell
      // "0 rows matched (e.g. RLS denied it)" apart from "actually deleted".
      const { data: deletedRows, error: deleteError } = await supabase
        .from('headlines')
        .delete()
        .eq('id', row.id)
        .select('id');
      if (deleteError) {
        blocked++;
        lastBlockedDetail = deleteError.message;
      } else if (!deletedRows || deletedRows.length === 0) {
        blocked++;
        lastBlockedDetail = `delete on id=${row.id} matched 0 rows (likely blocked by RLS)`;
      } else {
        deleted++;
      }
      continue;
    }

    const { score, policy_relevance, summary } = await scoreHeadline(row.title);
    const { data: updatedRows, error: updateError } = await supabase
      .from('headlines')
      .update({ score, policy_relevance, summary })
      .eq('id', row.id)
      .select('id');
    if (updateError) {
      blocked++;
      lastBlockedDetail = updateError.message;
    } else if (!updatedRows || updatedRows.length === 0) {
      blocked++;
      lastBlockedDetail = `update on id=${row.id} matched 0 rows (likely blocked by RLS)`;
    } else if (policy_relevance === null || (summary && summary.startsWith('ERROR'))) {
      // The write itself succeeded, but scoreHeadline() errored (e.g. bad model
      // name, malformed JSON from Gemini) and wrote back nulls — this row will
      // keep reappearing in the backlog query forever if left as "scored".
      scoreFailed++;
      lastScoreError = summary;
    } else {
      scored++;
      // Re-read straight from the DB (bypassing whatever .select() on the
      // update returned) to confirm the write actually persisted.
      const { data: verifyRow } = await supabase
        .from('headlines')
        .select('id, policy_relevance')
        .eq('id', row.id)
        .single();
      debug.push({ id: row.id, wrote: policy_relevance, verifiedInDb: verifyRow?.policy_relevance ?? 'ROW_NOT_FOUND' });
    }
  }

  const { count: remaining } = await supabase
    .from('headlines')
    .select('id', { count: 'exact', head: true })
    .is('policy_relevance', null);

  return NextResponse.json({
    scored,
    deleted,
    blocked,
    scoreFailed,
    ...(blocked ? { lastBlockedDetail } : {}),
    ...(scoreFailed ? { lastScoreError } : {}),
    debug,
    remaining: remaining ?? null,
    elapsedMs: Date.now() - start,
    stoppedReason,
  });
}
