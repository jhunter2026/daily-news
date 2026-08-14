import Parser from 'rss-parser';
import { supabase } from '../lib/supabaseClient';

// This is now a LIST so it's ready for you to add more feeds later.
// Right now it's just one, matching what you had before.
const FEEDS = [
  { url: 'https://feeds.npr.org/1001/rss.xml', source: 'NPR' },
];

async function fetchAndSaveHeadlines() {
  const parser = new Parser();

  for (const feed of FEEDS) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);

      const rows = parsedFeed.items.slice(0, 10).map((item) => ({
        title: item.title,
        link: item.link,
        source: feed.source,
        pub_date: item.pubDate ? new Date(item.pubDate) : null,
      }));

      // upsert = insert new rows, but skip/update existing ones instead of
      // erroring out, based on the "link" column being unique.
      await supabase.from('headlines').upsert(rows, { onConflict: 'link' });
    } catch (err) {
      console.error(`Failed to fetch feed ${feed.url}:`, err.message);
    }
  }
}

async function getStoredHeadlines() {
  const { data, error } = await supabase
    .from('headlines')
    .select('*')
    .order('pub_date', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error reading headlines:', error.message);
    return [];
  }

  return data;
}

export default async function HomePage() {
  await fetchAndSaveHeadlines();
  const headlines = await getStoredHeadlines();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: '#888' }}>
        DAILY NEWS
      </h1>
      <h2 style={{ fontSize: 32, marginTop: 4, marginBottom: 32 }}>
        Today's Headlines
      </h2>

      {headlines.length === 0 && (
        <p style={{ color: '#999' }}>
          No headlines yet — check your Supabase connection and feed URLs.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {headlines.map((item) => (
          <li
            key={item.id}
            style={{
              borderBottom: '1px solid #ddd',
              padding: '20px 0',
            }}
          >
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 20, color: '#111', textDecoration: 'none', fontWeight: 600 }}
            >
              {item.title}
            </a>
            <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
              {item.source} · {item.pub_date ? new Date(item.pub_date).toLocaleString() : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
