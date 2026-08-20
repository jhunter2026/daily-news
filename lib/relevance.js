// Tune this list to adjust what counts as "on-topic" for general-news sources.
const OUTDOOR_KEYWORDS = [
  'hunt', 'hunter', 'hunting', 'fish', 'fishing', 'angler', 'angling',
  'wildlife', 'conservation', 'public land', 'national forest', 'national park',
  'national monument', 'wildlife refuge', 'wilderness', 'backcountry',
  'overland', 'camping', 'campsite', 'trailhead', 'hiking', 'hiker',
  'endangered species', 'poaching', 'poacher', 'game warden',
  'blm', 'bureau of land management', 'forest service',
  'elk', 'grizzly', 'bison', 'salmon', 'trout', 'migratory bird',
  'watershed', 'wetland', 'outdoor recreation', 'access to public lands',
];

// Plain substring matching means a genuinely ambiguous keyword can false-
// positive on unrelated coverage -- "camping" matches "anti-camping," which
// in local news almost always means homeless-encampment policy, not
// recreational camping (caught a real example: an LA City Council
// homelessness story scored an 8 and nearly made the curated homepage on the
// strength of that one word). If any of these appear, treat the story as
// off-topic regardless of what else matched.
const FALSE_POSITIVE_PHRASES = ['anti-camping', 'encampment', 'homeless camp'];

// General-news sources cover everything, so we only score the headlines that
// are actually about outdoor/conservation topics. Outdoor/policy sources are
// on-topic by definition and skip this filter entirely.
export function isRelevant(title, category) {
  if (category !== 'general') return true;
  if (!title) return false;
  const lower = title.toLowerCase();
  if (FALSE_POSITIVE_PHRASES.some((phrase) => lower.includes(phrase))) return false;
  return OUTDOOR_KEYWORDS.some((keyword) => lower.includes(keyword));
}
