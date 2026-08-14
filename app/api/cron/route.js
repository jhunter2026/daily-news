import Parser from 'rss-parser';
import { supabase } from '../../../lib/supabaseClient';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FEEDS = [
  { url: 'https://feeds.npr.org/1001/rss.xml', source: 'NPR' },
  { url: 'https://gothamist.com/feed', source: 'Gothamist' },
  { url: 'https://www.themeateater.com/feed', source: 'MeatEater' },
  { url: 'https://www.thefp.com/feed', source: 'The Free Press' },
];

export async function GET() {
  const parser = new Parser();
  const results = [];

  for (const feed of FEEDS) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);

      const rows = parsedFeed.items.slice(0, 10).map((item) => ({
        title: item.title,
        link: item.link,
        source: feed.source,
        pub_date: item.pubDate ? new Date(item.pubDate) : null,
      }));

      const { error } = await supabase.from('headlines').upsert(rows, { onConflict: 'link' });

      if (error) {
        results.push({ source: feed.source, status: 'error', message: error.message });
      } else {
        results.push({ source: feed.source, status: 'ok', count: rows.length });
      }
    } catch (err) {
      results.push({ source: feed.source, status: 'error', message: err.message });
    }
  }

  // Grab today's freshest headlines per source, same fairness logic as the homepage
  const emailHeadlines = [];
  for (const feed of FEEDS) {
    const { data } = await supabase
      .from('headlines')
      .select('*')
      .eq('source', feed.source)
      .order('pub_date', { ascending: false })
      .limit(5);
    if (data) emailHeadlines.push(...data);
  }
  emailHeadlines.sort((a, b) => new Date(b.pub_date) - new Date(a.pub_date));

  // Build a simple HTML email
  const htmlList = emailHeadlines
    .map(
      (item) =>
        `<li style="margin-bottom:16px;"><a href="${item.link}" style="font-size:16px;color:#111;font-weight:600;text-decoration:none;">${item.title}</a><br/><span style="color:#666;font-size:13px;">${item.source}</span></li>`
    )
    .join('');

  let emailStatus = 'skipped';
  try {
    await resend.emails.send({
      from: 'Daily News <onboarding@resend.dev>',
      to: 'YOUR_EMAIL_HERE',
      subject: `Daily News — ${new Date().toLocaleDateString()}`,
      html: `<h2>Today's Headlines</h2><ul style="list-style:none;padding:0;">${htmlList}</ul>`,
    });
    emailStatus = 'sent';
  } catch (err) {
    emailStatus = `failed: ${err.message}`;
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results, emailStatus });
}
