import { supabase } from '../../lib/supabaseClient';
import { getCuratedHeadlines } from '../../lib/curation';

export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  const { data: headlines, error } = await getCuratedHeadlines(supabase);

  return (
    <main className="page">
      <header className="masthead card">
        <div className="brand">
          Daily News <span className="brand-badge">Wire</span>
        </div>
        <div className="masthead-date">Social Images</div>
        <div className="masthead-subtitle">
          One ready-to-post square image per story above threshold — save or download, then post yourself.
        </div>
        <div className="masthead-rule" />
      </header>

      {error && (
        <div className="error-state card">
          <strong>Debug info:</strong>
          <p>Read error: {error}</p>
        </div>
      )}

      {headlines.length === 0 && !error && (
        <div className="empty-state card">No stories to generate images for yet.</div>
      )}

      <div className="social-grid">
        {headlines.map((item) => (
          <div key={item.id} className="social-card card">
            <img
              src={`/api/story-image?id=${item.id}`}
              alt={item.title}
              width={1080}
              height={1080}
              className="social-thumb"
            />
            <p className="social-title">{item.title}</p>
            <a href={`/api/story-image?id=${item.id}`} download={`story-${item.id}.png`} className="story-link">
              Download →
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
