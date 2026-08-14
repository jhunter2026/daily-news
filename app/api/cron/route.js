import Parser from 'rss-parser';
import { supabase } from '../../../lib/supabaseClient';
import { NextResponse } from 'next/server';

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

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
