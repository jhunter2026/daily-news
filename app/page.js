import Parser from 'rss-parser';

// This is the ONE thing this starter proves out: pulling in real articles
// from a live news source. Swap this URL for any local news RSS feed you want.
const FEED_URL = 'https://feeds.npr.org/1001/rss.xml';

async function getHeadlines() {
  const parser = new Parser();
  try {
    const feed = await parser.parseURL(FEED_URL);
    return feed.items.slice(0, 10);
  } catch (err) {
    return [];
  }
}

export default async function HomePage() {
  const headlines = await getHeadlines();

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
          No headlines loaded yet — check the feed URL in app/page.js.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {headlines.map((item, i) => (
          <li
            key={i}
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
              {item.pubDate}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
