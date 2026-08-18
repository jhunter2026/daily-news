import { supabase } from '../lib/supabaseClient';
import { getCuratedHeadlines, scoreColor } from '../lib/curation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { data: headlines, error: readError } = await getCuratedHeadlines(supabase);
  const topScore = headlines.length > 0 ? Math.max(...headlines.map((h) => h.score)) : null;
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <main className="page">
      <header className="masthead card">
        <div className="masthead-top">
          <div className="brand">
            Daily News <span className="brand-badge">Wire</span>
          </div>
          {topScore !== null && (
            <div className="top-score">
              <div className="top-score-label">Top Score</div>
              <div className="top-score-value" style={{ color: scoreColor(topScore) }}>
                {topScore.toFixed(1)}
              </div>
            </div>
          )}
        </div>
        <div className="masthead-date">{today}</div>
        <div className="masthead-subtitle">
          {headlines.length} {headlines.length === 1 ? 'story' : 'stories'} ranked by national breakout potential · scored by Gemini
        </div>
        <div className="masthead-rule" />
      </header>

      {readError && (
        <div className="error-state card">
          <strong>Debug info:</strong>
          <p>Read error: {readError}</p>
        </div>
      )}

      {headlines.length === 0 && !readError && (
        <div className="empty-state card">
          No headlines yet — check back after the next scheduled update.
        </div>
      )}

      <ul className="story-list">
        {headlines.map((item, index) => (
          <li key={item.id} className="story-card card">
            <div className={`story-rank-label${index === 0 ? ' lead' : ''}`}>
              {index === 0 ? "★ Today's Lead" : `#${index + 1}`}
            </div>
            <div className="story-body">
              <div className="story-score">
                <div className="story-score-value" style={{ color: scoreColor(item.score) }}>
                  {item.score.toFixed(1)}
                </div>
                <div className="story-score-caption">Breakout</div>
              </div>
              <div className="story-main">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="story-headline"
                >
                  {item.title}
                </a>
                {item.summary && !item.summary.startsWith('ERROR') && (
                  <p className="story-summary">{item.summary}</p>
                )}
                <div className="story-badges">
                  <span className="badge">Breakout {item.score}</span>
                  {item.policy_relevance !== null && (
                    <span className="badge">Policy {item.policy_relevance}</span>
                  )}
                </div>
                <div className="story-meta">
                  <span>{item.source}</span>
                  {item.pub_date && (
                    <>
                      <span>·</span>
                      <span>{new Date(item.pub_date).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="story-link"
                >
                  Read full story →
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
