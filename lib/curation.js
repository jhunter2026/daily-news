// Shared query used by the homepage, the email digest, and the social-image
// review page, so all three stay in sync on what counts as "good enough to
// show" and how it's ranked.
export const SCORE_THRESHOLD = 5;

// Without this, a 9/10 story from weeks ago sits at the top forever, since
// nothing ever aged it out -- it would permanently outrank anything newer
// that scored even slightly lower, no matter how current. Filtered on
// pub_date (the real-world publish time), not when we happened to score it,
// since the goal is "what's actually recent," not "what we processed
// recently." 48h (not 24h) to give slow-to-score items -- this pipeline
// doesn't score everything same-day -- a real chance to still show up.
export const RECENCY_WINDOW_HOURS = 48;

// Ranking blends breakout potential with urgency, so a genuinely breaking
// story (high urgency, maybe-modest breakout) can outrank a bigger but
// slower-burn piece -- straight breakout_score alone was the reason
// legitimately current stories felt buried under "will become a big
// conversation eventually" analysis pieces. Falls back to pure breakout for
// rows scored before urgency_score existed, rather than treating a missing
// value as 0 and unfairly tanking their rank.
function rankScore(item) {
  if (item.urgency_score === null || item.urgency_score === undefined) return item.score;
  return (item.score + item.urgency_score) / 2;
}

export async function getCuratedHeadlines(client) {
  const cutoff = new Date(Date.now() - RECENCY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  // The threshold gate stays on raw breakout score only (not the blend) --
  // urgency affects ranking among qualifying stories, not which stories
  // qualify at all.
  const { data, error } = await client
    .from('headlines')
    .select('*')
    .gt('score', SCORE_THRESHOLD)
    .gte('pub_date', cutoff);

  if (error) return { data: [], error: error.message };

  const ranked = (data || []).sort(
    (a, b) => rankScore(b) - rankScore(a) || new Date(b.pub_date) - new Date(a.pub_date)
  );
  return { data: ranked, error: null };
}

// For the operator dashboard: every recent story regardless of score, so the
// owner can see what the AI passed on (or choked on) too, not just what
// cleared the bar. Deliberately a separate, longer window than the curated
// view's -- the dashboard is a monitoring/review tool ("what has the
// pipeline done this week"), not "what's worth showing right now," so it
// looks back further. No score gate, no urgency blend -- the dashboard's
// whole point is seeing the raw scores themselves, not a pre-judged ranking.
export const DASHBOARD_WINDOW_DAYS = 7;

export async function getRecentHeadlines(client) {
  const cutoff = new Date(Date.now() - DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('headlines')
    .select('*')
    .gte('pub_date', cutoff)
    .order('pub_date', { ascending: false });
  return { data: data || [], error: error ? error.message : null };
}

// Also used by the social-image generator so card colors match the homepage.
export function scoreColor(score) {
  if (score >= 8) return '#d6331f';
  if (score >= 7) return '#e2711d';
  return '#c98a15';
}
