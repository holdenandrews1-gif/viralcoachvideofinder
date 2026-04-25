import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

let _client = null;
function client() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Pulls the first JSON value out of a model response, tolerating prose
 * wrappers or ```json fences.
 */
function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Try as-is first
  try {
    return JSON.parse(candidate);
  } catch {}
  // Fall back to first {...} or [...] block
  const objMatch = candidate.match(/[{\[][\s\S]*[}\]]/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {}
  }
  throw new Error('Model did not return valid JSON');
}

/**
 * Generate a short summary + topic tags for each video in a batch.
 * Input: [{ videoId, title, description }]
 * Output: [{ videoId, summary, tags: [string] }]  (length matches input)
 */
export async function summarizeBatch(videos) {
  if (!videos.length) return [];

  const compact = videos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    // Cap description so we don't blow tokens on long auto-descriptions.
    description: (v.description || '').slice(0, 1500),
  }));

  const prompt = `You will be given a JSON array of YouTube videos (with videoId, title, and description).
For EACH video, produce:
- summary: a 1-2 sentence plain-language summary of what the video is actually about, focused on what a viewer would learn or take away. Avoid filler ("In this video...").
- tags: 3-6 short topic tags (lowercase, hyphen-or-space-separated, no leading "#").

Return ONLY a JSON array with the same length and order as the input. Each element must have: { "videoId": string, "summary": string, "tags": string[] }.

Videos:
${JSON.stringify(compact)}`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of summaries');

  // Index by videoId so order mismatches don't break the import.
  const byId = new Map();
  for (const item of parsed) {
    if (item && item.videoId) byId.set(item.videoId, item);
  }

  return videos.map((v) => {
    const m = byId.get(v.videoId) || {};
    return {
      videoId: v.videoId,
      summary: typeof m.summary === 'string' ? m.summary : '',
      tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === 'string').slice(0, 8) : [],
    };
  });
}

/**
 * Given prospect notes and the full library, return the top 3 best matches.
 * Library items: [{ id, title, summary, tags, url }]
 * Returns: [{ id, reason }] — exactly 3 items, ordered best-first.
 */
export async function findTopMatches(notes, library) {
  if (!library.length) return [];

  // Strip down to keep tokens reasonable on big libraries.
  const compactLibrary = library.map((v) => ({
    id: v.id,
    title: v.title,
    summary: v.summary || '',
    tags: v.tags || [],
  }));

  const prompt = `You help a sales rep pick the single most useful founder-channel video to send a prospect after a call.

PROSPECT NOTES (what the prospect said, their pain points, role, industry, etc.):
"""
${notes}
"""

VIDEO LIBRARY (JSON):
${JSON.stringify(compactLibrary)}

Pick the TOP 3 videos from the library that are most relevant for this specific prospect. For each pick, write a concise 1-2 sentence reason that explicitly ties the video's content to something the prospect said or cares about. Be specific — don't just say "this is a great overview".

Return ONLY a JSON array of exactly 3 items, ordered best match first:
[
  { "id": "<video id from the library>", "reason": "<why this fits this prospect>" }
]

If the library has fewer than 3 videos, return as many as exist. Use video ids exactly as given.`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of matches');

  const byId = new Map(library.map((v) => [v.id, v]));
  const results = [];
  for (const item of parsed) {
    if (!item || !item.id) continue;
    const video = byId.get(item.id);
    if (!video) continue;
    results.push({ ...video, reason: item.reason || '' });
    if (results.length >= 3) break;
  }
  return results;
}
