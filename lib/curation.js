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

export async function getCuratedHeadlines(client) {
  const cutoff = new Date(Date.now() - RECENCY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('headlines')
    .select('*')
    .gt('score', SCORE_THRESHOLD)
    .gte('pub_date', cutoff)
    .order('score', { ascending: false })
    .order('pub_date', { ascending: false });
  return { data: data || [], error: error ? error.message : null };
}

// Also used by the social-image generator so card colors match the homepage.
export function scoreColor(score) {
  if (score >= 8) return '#d6331f';
  if (score >= 7) return '#e2711d';
  return '#c98a15';
}
