// Shared query used by the homepage, the email digest, and the social-image
// review page, so all three stay in sync on what counts as "good enough to
// show" and how it's ranked.
export const SCORE_THRESHOLD = 5;

export async function getCuratedHeadlines(client) {
  const { data, error } = await client
    .from('headlines')
    .select('*')
    .gt('score', SCORE_THRESHOLD)
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
