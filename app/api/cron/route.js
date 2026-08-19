import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getCuratedHeadlines } from '../../../lib/curation';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby plan hard ceiling — cannot be raised

const resend = new Resend(process.env.RESEND_API_KEY);

// Once-a-day email brief. Triggered on a schedule (see `vercel.json`: daily
// at 13:00 UTC) via Vercel Cron -- the actual fetch-and-score work that keeps
// the underlying data fresh throughout the day lives in /api/scan instead,
// since Vercel Cron only fires a given schedule once a day on the Hobby
// plan, but scan needs to run much more often. This route just reads
// whatever scan has already written and sends the digest -- no RSS fetching,
// no Gemini calls, so it's fast and has nothing to time out on.
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
  let emailStatus = 'skipped';

  try {
    const { data: emailHeadlines, error } = await getCuratedHeadlines(supabaseAdmin);
    if (error) throw new Error(error);

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

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    elapsedMs: Date.now() - start,
    emailStatus,
  });
}
