import Parser from 'rss-parser';
import { supabase } from '../lib/supabaseClient';

// This forces Next.js to run this code fresh on every single visit,
// instead of reusing a snapshot from when the site was first built.
export const dynamic = 'force-dynamic';

const FEEDS = [
  { url: 'https://feeds.npr.org/1001/rss.xml', source: 'NPR' },
  { url: 'https://gothamist.com/feed', source: 'Gothamist' },
  { url: 'https://laist.com/rss/latest-news', source: 'LAist' },
  { url: 'https://www.themeateater.com/feed', source: 'MeatEater' },
  { url: 'https://www.thefp.com/feed', source: 'The Free Press' },
];

async function fetchAndSaveHeadlines() {
  const parser = new Parser();
  const errors = [];

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
        errors.push(`Supabase upsert error for ${feed.source}: ${error.message}`);
      }
    } catch (err) {
      errors.push(`Failed to fetch feed ${feed.url}: ${err.message}`);
    }
  }

  return errors;
}

async function getStoredHeadlines() {
  const { data, error } = await supabase
    .from('headlines')
    .select('*')
    .order('pub_date', { ascending: false })
    .limit(20);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data, error: null };
}

export default async function HomePage() {
  const fetchErrors = await fetchAndSaveHeadlines();
  const { data: headlines, error: readError } = await getStoredHeadlines();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: '#888' }}>
        DAILY NEWS
      </h1>
      <h2 style={{ fontSize: 32, marginTop: 4, marginBottom: 32 }}>
        Today's Headlines
      </h2>

      {(fetchErrors.length > 0 || readError) && (
        <div style={{ background: '#fee', border: '1px solid #c00', padding: 16, marginBottom: 24, borderRadius: 4 }}>
          <strong style={{ color: '#900' }}>Debug info:</strong>
          {fetchErrors.map((e, i) => (
            <p key={i} style={{ color: '#900', fontSize: 13, margin: '4px 0' }}>{e}</p>
          ))}
          {readError && <p style={{ color: '#900', fontSize: 13, margin: '4px 0' }}>Read error: {readError}</p>}
        </div>
      )}

      {headlines.length === 0 && fetchErrors.length === 0 && !readError && (
        <p style={{ color: '#999' }}>
          No headlines yet — the feed may not have returned any items.
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
