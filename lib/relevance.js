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

// General-news sources cover everything, so we only score the headlines that
// are actually about outdoor/conservation topics. Outdoor/policy sources are
// on-topic by definition and skip this filter entirely.
export function isRelevant(title, category) {
  if (category !== 'general') return true;
  if (!title) return false;
  const lower = title.toLowerCase();
  return OUTDOOR_KEYWORDS.some((keyword) => lower.includes(keyword));
}
