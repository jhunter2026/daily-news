import Parser from 'rss-parser';
import { supabase } from '../../../lib/supabaseClient';
import { FEEDS } from '../../../lib/feeds';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


async function scoreHeadline(title) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `You are scoring a headline for an outdoor/conservation/hunting/camping/overlanding news digest, on two separate dimensions:

1. breakout_score (1-10): How likely is this to become a bigger national conversation, beyond its local/niche origin?
2. policy_relevance (1-10): How much does this affect public land access, hunting/fishing regulations, conservation policy, or outdoor recreation rights? A 1 means no policy angle at all; a 10 means this directly changes access, law, or regulation for outdoor recreation.

Headline: "${title}"

Respond with ONLY valid JSON, no other text, in this exact format:
{"breakout_score": <number 1-10>, "policy_relevance": <number 1-10>, "summary": "<one sentence explaining both scores, under 30 words>"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      score: parsed.breakout_score,
      policy_relevance: parsed.policy_relevance,
      summary: parsed.summary,
    };
  } catch (err) {
    return { score: null, policy_relevance: null, summary: `ERROR: ${err.message}` };
  }
}

export async function GET() {
 const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});
  const results = [];

  for (const feed of FEEDS) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);
      const items = parsedFeed.items.slice(0, 10);
    const links = items.map((i) => i.link);
    const { data: existing } = await supabase
    .from('headlines')
    .select('link, score')
    .in('link', links);
  const alreadyScored = new Set(
    (existing || []).filter((r) => r.score !== null).map((r) => r.link)
);
      const rows = [];
      for (const item of items) {
        if (alreadyScored.has(item.link)) {
        continue;
    }
  const { score, policy_relevance, summary } = await scoreHeadline(item.title);  
        rows.push({
        title: item.title,
        link: item.link,
        source: feed.source,
        pub_date: item.pubDate ? new Date(item.pubDate) : null,
        score,
        policy_relevance,
        summary,
});
        
      }

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

  const htmlList = emailHeadlines
    .map(
      (item) =>
        `<li style="margin-bottom:16px;"><a href="${item.link}" style="font-size:16px;color:#111;font-weight:600;text-decoration:none;">${item.title}</a><br/><span style="color:#666;font-size:13px;">${item.source}${item.score ? ` · Score: ${item.score}/10` : ''}</span>${item.summary ? `<br/><span style="color:#444;font-size:14px;">${item.summary}</span>` : ''}</li>`
    )
    .join('');

  let emailStatus = 'skipped';
  try {
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

  return NextResponse.json({ ranAt: new Date().toISOString(), results, emailStatus });
}
