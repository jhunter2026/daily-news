import { supabase } from '../../lib/supabaseClient';
import { getRecentHeadlines, RECENCY_WINDOW_HOURS } from '../../lib/curation';
import DashboardTable from './DashboardTable';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { data: headlines, error } = await getRecentHeadlines(supabase);

  return (
    <main className="page">
      <header className="masthead card">
        <div className="brand">
          Daily News <span className="brand-badge">Wire</span>
        </div>
        <div className="masthead-date">Dashboard</div>
        <div className="masthead-subtitle">
          Every story scored in the last {RECENCY_WINDOW_HOURS} hours — including ones that didn&apos;t make the public cut.
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
        <div className="empty-state card">No stories scored in this window yet.</div>
      )}

      {headlines.length > 0 && (
        <div className="card dashboard-card">
          <DashboardTable headlines={headlines} />
        </div>
      )}
    </main>
  );
}
