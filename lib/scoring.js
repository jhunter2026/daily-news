import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function scoreHeadline(title) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `You are scoring a headline for an outdoor/conservation/hunting/camping/overlanding news digest, on two separate dimensions:

1. breakout_score (1-10): How likely is this to become a bigger national conversation, beyond its local/niche origin?
2. policy_relevance (1-10): How much does this affect public land access, hunting/fishing regulations, conservation policy, or outdoor recreation rights? A 1 means no policy angle at all; a 10 means this directly changes access, law, or regulation for outdoor recreation.

Headline: "${title}"

Respond with ONLY valid JSON, no other text, in this exact format:
{"breakout_score": <number 1-10>, "policy_relevance": <number 1-10>, "summary": "<one sentence explaining both scores, under 30 words>"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      score: parsed.breakout_score,
      policy_relevance: parsed.policy_relevance,
      summary: parsed.summary,
    };
  } catch (err) {
    return { score: null, policy_relevance: null, summary: `ERROR: ${err.message}` };
  }
}
