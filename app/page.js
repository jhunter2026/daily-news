import { supabase } from '../lib/supabaseClient';
import { SCORE_THRESHOLD } from '../lib/curation';

export const dynamic = 'force-dynamic';

async function getStoredHeadlines() {
  const { data, error } = await supabase
    .from('headlines')
    .select('*')
    .gt('score', SCORE_THRESHOLD)
    .order('score', { ascending: false })
    .order('pub_date', { ascending: false });
  if (error) {
    return { data: [], error: `Error reading headlines: ${error.message}` };
  }
  return { data: data || [], error: null };
}

export default async function HomePage() {
  const { data: headlines, error: readError } = await getStoredHeadlines();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: '#888' }}>
        DAILY NEWS
      </h1>
      <h2 style={{ fontSize: 32, marginTop: 4, marginBottom: 32 }}>
        Today's Headlines
      </h2>
      {readError && (
        <div style={{ background: '#fee', border: '1px solid #c00', padding: 16, marginBottom: 24, borderRadius: 4 }}>
          <strong style={{ color: '#900' }}>Debug info:</strong>
          <p style={{ color: '#900', fontSize: 13, margin: '4px 0' }}>Read error: {readError}</p>
        </div>
      )}
      {headlines.length === 0 && !readError && (
        <p style={{ color: '#999' }}>
          No headlines yet — check back after the next scheduled update.
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
              {item.score ? ` · Score: ${item.score}/10` : ''}
            </p>
            {item.summary && !item.summary.startsWith('ERROR') && (
              <p style={{ color: '#444', fontSize: 14, marginTop: 4 }}>{item.summary}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
