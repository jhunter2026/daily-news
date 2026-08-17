import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
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

  // Read-only diagnostic: ?stats=1 reports table-wide counts with no writes,
  // to check whether the backlog is genuinely shrinking or something else is
  // growing it back between calls (deleted:50 was reported on consecutive
  // calls even though remaining supposedly hadn't moved, which is impossible
  // if remaining were accurate and stable).
  if (new URL(request.url).searchParams.get('stats')) {
    const [{ count: total }, { count: nullCount }] = await Promise.all([
      supabaseAdmin.from('headlines').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('headlines').select('id', { count: 'exact', head: true }).is('policy_relevance', null),
    ]);
    return NextResponse.json({ total, nullCount });
  }

  const start = Date.now();

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from('headlines')
    .select('id, title, source')
    .is('policy_relevance', null)
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let scored = 0;
  let deleted = 0;
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
      const { error: deleteError } = await supabaseAdmin.from('headlines').delete().eq('id', row.id);
      if (!deleteError) deleted++;
      continue;
    }

    const { score, policy_relevance, summary } = await scoreHeadline(row.title);
    const { error: updateError } = await supabaseAdmin
      .from('headlines')
      .update({ score, policy_relevance, summary })
      .eq('id', row.id);
    if (updateError) continue;

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
    scoreFailed,
    ...(scoreFailed ? { lastScoreError } : {}),
    remaining: remaining ?? null,
    elapsedMs: Date.now() - start,
    stoppedReason,
  });
}
