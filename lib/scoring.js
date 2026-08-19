import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The SDK has no built-in call timeout, so a single stuck request otherwise
// blocks the whole function until Vercel force-kills it at the 10s hard wall
// -- observed directly (3 consecutive FUNCTION_INVOCATION_TIMEOUTs with zero
// progress on the same 2 headlines). Racing against this turns a hang into a
// normal, recoverable error instead.
//
// 3000ms was too tight: two specific headlines consistently needed longer
// than that to get a real response (not a hang -- still failing the same way
// after a 45s cooldown, so not simple rate-limit backoff either; more likely
// Gemini's own safety/content classifiers taking longer on policy-advocacy
// text, which is exactly this app's niche). Callers must size their own
// TIME_BUDGET_MS/SCORING_DEADLINE_MS around this value -- that check only
// runs *between* items, so the real worst case is deadline + one more full
// GEMINI_TIMEOUT_MS for whichever item was already in flight.
export const GEMINI_TIMEOUT_MS = 4500;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Gemini call exceeded ${ms}ms`)), ms)),
  ]);
}

export async function scoreHeadline(title) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `You are scoring a headline for an outdoor/conservation/hunting/camping/overlanding news digest, on three separate dimensions, and also writing a public social media caption for it.

1. breakout_score (1-10): How likely is this to become a bigger national conversation, beyond its local/niche origin?
2. policy_relevance (1-10): How much does this affect public land access, hunting/fishing regulations, conservation policy, or outdoor recreation rights? A 1 means no policy angle at all; a 10 means this directly changes access, law, or regulation for outdoor recreation.
3. urgency_score (1-10): How time-sensitive is this right now? A 10 means this is an actively unfolding event or something just announced/decided today; a 1 means this is evergreen content (gear reviews, "best of" lists, retrospectives, how-to guides) that could have been published on any day. Judge this independently of breakout_score -- a story can be a slow-burn analysis piece with huge breakout potential (low urgency) or a minor but literally-breaking development (high urgency, modest breakout).

Headline: "${title}"

Respond with ONLY valid JSON, no other text, in this exact format:
{"breakout_score": <number 1-10>, "policy_relevance": <number 1-10>, "urgency_score": <number 1-10>, "summary": "<one sentence explaining all three scores, under 30 words -- this is an internal editorial note, never shown publicly, so it can reference the scores directly>", "caption": "<a ready-to-post Instagram caption for this story, written for a general public audience, 2-3 sentences, no mention of scores/breakout potential/policy relevance/urgency or any other scoring jargon, ending with 3-5 relevant hashtags>"}`;

    const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      score: parsed.breakout_score,
      policy_relevance: parsed.policy_relevance,
      urgency_score: parsed.urgency_score,
      summary: parsed.summary,
      caption: parsed.caption,
    };
  } catch (err) {
    return { score: null, policy_relevance: null, urgency_score: null, summary: `ERROR: ${err.message}`, caption: null };
  }
}
