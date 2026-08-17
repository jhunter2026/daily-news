import Parser from 'rss-parser';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { FEEDS } from '../../../lib/feeds';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { scoreHeadline } from '../../../lib/scoring';
import { isRelevant } from '../../../lib/relevance';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby plan hard ceiling — cannot be raised

const resend = new Resend(process.env.RESEND_API_KEY);

// Everything below is budgeted against a 10s hard wall, so each phase gets a
// deadline rather than a headline/row count: Gemini call latency is the
// variable that actually determines how much fits, not an item count. The
// check only runs *between* items, so the worst case isn't SCORING_DEADLINE_MS
// -- it's SCORING_DEADLINE_MS + one more full GEMINI_TIMEOUT_MS (3s, see
// lib/scoring.js) for the item already in flight when the deadline was
// crossed. A 6000+5000 combination measurably blew the 10s wall in practice;
// 4500+3000=7500 leaves real margin, and email only gets a further ~2.5s on
// top of that worst case.
const SCORING_DEADLINE_MS = 4500;
const EMAIL_ATTEMPT_DEADLINE_MS = 7500;

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

// Only the scoring loop is order-sensitive (it stops once time runs out), so
// start from a different feed each day — otherwise sources late in FEEDS
// would starve indefinitely whenever earlier ones fill the whole budget.
function rotateFeeds(feeds, now = new Date()) {
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const offset = dayIndex % feeds.length;
  return [...feeds.slice(offset), ...feeds.slice(0, offset)];
}

async function fetchCandidates(feed) {
  try {
    const parsedFeed = await parser.parseURL(feed.url);
    const items = parsedFeed.items.slice(0, 10);
    if (items.length === 0) return { feed, status: 'ok', items: [] };

    const links = items.map((i) => i.link);
    const { data: existing } = await supabaseAdmin
      .from('headlines')
      .select('link, score, policy_relevance')
      .in('link', links);
    const alreadyScored = new Set(
      (existing || [])
        .filter((r) => r.score !== null && r.policy_relevance !== null)
        .map((r) => r.link)
    );
    const candidates = items.filter(
      (item) => !alreadyScored.has(item.link) && isRelevant(item.title, feed.category)
    );
    return { feed, status: 'ok', items: candidates };
  } catch (err) {
    return { feed, status: 'error', message: err.message, items: [] };
  }
}

export async function GET() {
  const start = Date.now();

  // Fetching feeds one at a time can burn most of the 10s budget on network
  // latency alone before a single headline gets scored, so fetch + dedup +
  // relevance-filter every feed concurrently instead.
  const rotatedFeeds = rotateFeeds(FEEDS);
  const fetchResults = await Promise.all(rotatedFeeds.map(fetchCandidates));

  const results = [];
  let timedOut = false;

  for (const { feed, status, message, items } of fetchResults) {
    if (status === 'error') {
      results.push({ source: feed.source, status: 'error', message });
      continue;
    }
    if (timedOut) {
      results.push({ source: feed.source, status: 'skipped', reason: 'time_budget', pending: items.length });
      continue;
    }

    let scoredCount = 0;
    let errorCount = 0;
    let scoreFailedCount = 0;
    let lastError = null;

    for (const item of items) {
      if (Date.now() - start > SCORING_DEADLINE_MS) {
        timedOut = true;
        break;
      }
      const { score, policy_relevance, summary } = await scoreHeadline(item.title);
      const { error } = await supabaseAdmin.from('headlines').upsert(
        {
          title: item.title,
          link: item.link,
          source: feed.source,
          pub_date: item.pubDate ? new Date(item.pubDate) : null,
          score,
          policy_relevance,
          summary,
        },
        { onConflict: 'link' }
      );
      if (error) {
        errorCount++;
        lastError = error.message;
      } else if (policy_relevance === null || (summary && summary.startsWith('ERROR'))) {
        // The write succeeded, but scoreHeadline() itself errored (e.g. a
        // transient Gemini failure) and wrote back nulls — this headline will
        // need /api/backfill later rather than being silently counted as scored.
        scoreFailedCount++;
        lastError = summary;
      } else {
        scoredCount++;
      }
    }

    const pending = items.length - scoredCount - errorCount - scoreFailedCount;
    results.push({
      source: feed.source,
      status: errorCount > 0 ? 'error' : pending > 0 ? 'partial' : 'ok',
      scored: scoredCount,
      ...(scoreFailedCount ? { scoreFailed: scoreFailedCount } : {}),
      ...(errorCount ? { errors: errorCount, message: lastError } : {}),
      ...(pending > 0 ? { pending } : {}),
    });
  }

  let emailStatus = 'skipped: time_budget';
  if (Date.now() - start < EMAIL_ATTEMPT_DEADLINE_MS) {
    try {
      const digestResults = await Promise.all(
        FEEDS.map((feed) =>
          supabaseAdmin
            .from('headlines')
            .select('*')
            .eq('source', feed.source)
            .order('pub_date', { ascending: false })
            .limit(5)
        )
      );
      const emailHeadlines = digestResults.flatMap((r) => r.data || []);
      emailHeadlines.sort((a, b) => new Date(b.pub_date) - new Date(a.pub_date));

      const htmlList = emailHeadlines
        .map(
          (item) =>
            `<li style="margin-bottom:16px;"><a href="${item.link}" style="font-size:16px;color:#111;font-weight:600;text-decoration:none;">${item.title}</a><br/><span style="color:#666;font-size:13px;">${item.source}${item.score ? ` · Score: ${item.score}/10` : ''}</span>${item.summary ? `<br/><span style="color:#444;font-size:14px;">${item.summary}</span>` : ''}</li>`
        )
        .join('');

      await resend.emails.send({
        from: 'Daily News <onboarding@resend.dev>',
        to: 'joeygrimmer.production@gmail.com',
        subject: `Daily News — ${new Date().toLocaleDateString()}`,
        html: `<h2>Today's Headlines</h2><ul style="list-style:none;padding:0;">${htmlList}</ul>`,
      });
      emailStatus = 'sent';
    } catch (err) {
      emailStatus = `failed: ${err.message}`;
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    elapsedMs: Date.now() - start,
    results,
    emailStatus,
  });
}
