import Parser from 'rss-parser';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { FEEDS } from '../../../lib/feeds';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { scoreHeadline } from '../../../lib/scoring';
import { isRelevant } from '../../../lib/relevance';
import { getCuratedHeadlines } from '../../../lib/curation';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby plan hard ceiling — cannot be raised

const resend = new Resend(process.env.RESEND_API_KEY);

// Everything below is budgeted against a 10s hard wall, so each phase gets a
// deadline rather than a headline/row count: Gemini call latency is the
// variable that actually determines how much fits, not an item count. The
// check only runs *between* items, so the worst case isn't SCORING_DEADLINE_MS
// -- it's SCORING_DEADLINE_MS + one more full GEMINI_TIMEOUT_MS (see
// lib/scoring.js) for the item already in flight when the deadline was
// crossed: 3500+4500=8000ms, leaving ~2s under the 10s wall. Email only gets
// a further ~500ms of slack on top of that worst case before being skipped.
const SCORING_DEADLINE_MS = 3500;
const EMAIL_ATTEMPT_DEADLINE_MS = 8500;

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  // media:thumbnail/media:content aren't part of the base RSS spec, so
  // rss-parser doesn't expose them by default -- needed for the social-image
  // background photo, since <enclosure> (parsed by default) isn't present on
  // every feed that does have an image.
  customFields: {
    item: [
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:content', 'mediaContent'],
    ],
  },
});

// Not every feed exposes an image the same way -- checked in likelihood
// order: standard <enclosure> (rss-parser's default), then the two Yahoo
// Media RSS tags above, then a last-resort scrape of the first <img> in the
// full article HTML some feeds embed. Returns null (not an error) if none
// match, since plenty of feeds (Gothamist, LAist, BHA) just don't have one --
// the image route falls back to a plain card in that case.
function extractImageUrl(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const match = typeof html === 'string' ? html.match(/<img[^>]+src=["']([^"']+)["']/i) : null;
  return match ? match[1] : null;
}

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

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      new URL(request.url).searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

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
      const { score, policy_relevance, urgency_score, summary, caption } = await scoreHeadline(item.title);
      const { error } = await supabaseAdmin.from('headlines').upsert(
        {
          title: item.title,
          link: item.link,
          source: feed.source,
          pub_date: item.pubDate ? new Date(item.pubDate) : null,
          score,
          policy_relevance,
          urgency_score,
          summary,
          caption,
          image_url: extractImageUrl(item),
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
      const { data: emailHeadlines } = await getCuratedHeadlines(supabaseAdmin);

      const htmlList = emailHeadlines
        .map(
          (item) =>
            `<li style="margin-bottom:16px;"><a href="${item.link}" style="font-size:16px;color:#111;font-weight:600;text-decoration:none;">${item.title}</a><br/><span style="color:#666;font-size:13px;">${item.source}${item.score ? ` · Score: ${item.score}/10` : ''}${item.urgency_score !== null ? ` · Urgency: ${item.urgency_score}/10` : ''}</span>${item.summary ? `<br/><span style="color:#444;font-size:14px;">${item.summary}</span>` : ''}</li>`
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
