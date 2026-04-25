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
  try {
    return JSON.parse(candidate);
  } catch {}
  const objMatch = candidate.match(/[{\[][\s\S]*[}\]]/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {}
  }
  throw new Error('Model did not return valid JSON');
}

function textFromMessage(msg) {
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Generate a rich summary + tags + key_points for a single video, using
 * its transcript (preferred) or its description as fallback.
 *
 * Input:  { videoId, title, transcript?, description? }
 * Output: { videoId, summary, tags: [string], key_points: [string], hasTranscript }
 */
export async function summarizeFromTranscript(video) {
  const hasTranscript = video.transcript && video.transcript.trim().length > 100;
  const sourceLabel = hasTranscript ? 'TRANSCRIPT' : 'DESCRIPTION';
  const sourceText = hasTranscript
    ? video.transcript
    : (video.description || '').slice(0, 4000);

  if (!sourceText || sourceText.trim().length === 0) {
    // Nothing to work with — return a stub so the row still gets a non-null
    // summary and we don't keep retrying it forever.
    return {
      videoId: video.videoId,
      summary: video.title || '',
      tags: [],
      key_points: [],
      hasTranscript: false,
    };
  }

  const prompt = `You are summarizing a YouTube video for a sales-enablement library. The library is used by a sales rep who, after a call with a prospect, picks the single best video to send. Match quality matters more than brevity.

VIDEO TITLE: ${video.title}

${sourceLabel}:
"""
${sourceText}
"""

Return ONLY a JSON object with this exact shape:
{
  "summary": string,        // 4-6 sentences. What the video actually teaches, including the framework or argument the founder is making. Plain language. No "in this video" filler.
  "tags": string[],         // 3-6 short topic tags (lowercase, hyphen-or-space separated, no leading "#")
  "key_points": string[]    // 5-10 specific things covered. Each one a single concrete claim, framework, example, or piece of advice from the video — not a category. Examples of good key_points: "argues against posting daily because it dilutes signal", "framework for the first 90 seconds: hook, payoff promise, then prove it". Examples of BAD key_points: "content strategy", "tips for creators".
}

Be specific in key_points — these are what a sales rep will use to match this video to a prospect's actual stated problems.`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = parseJson(textFromMessage(msg));
  return {
    videoId: video.videoId,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((t) => typeof t === 'string').slice(0, 8)
      : [],
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((k) => typeof k === 'string').slice(0, 12)
      : [],
    hasTranscript,
  };
}

/**
 * Legacy batch summarizer — used by the Add Manually flow when we only
 * have a description. Returns one shape per video.
 */
export async function summarizeBatch(videos) {
  if (!videos.length) return [];
  const compact = videos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: (v.description || '').slice(0, 1500),
  }));
  const prompt = `For each YouTube video below, produce:
- summary: 1-2 sentences on what it teaches.
- tags: 3-6 short topic tags.
- key_points: 3-5 short bullets covering specific things in the video.

Return ONLY a JSON array, same length and order as input. Each: { "videoId": string, "summary": string, "tags": string[], "key_points": string[] }.

Videos:
${JSON.stringify(compact)}`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = parseJson(textFromMessage(msg));
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
  const byId = new Map();
  for (const item of parsed) if (item?.videoId) byId.set(item.videoId, item);
  return videos.map((v) => {
    const m = byId.get(v.videoId) || {};
    return {
      videoId: v.videoId,
      summary: typeof m.summary === 'string' ? m.summary : '',
      tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === 'string').slice(0, 8) : [],
      key_points: Array.isArray(m.key_points)
        ? m.key_points.filter((k) => typeof k === 'string').slice(0, 8)
        : [],
    };
  });
}

/**
 * Given prospect notes and the full library, return the top 3 best matches.
 * Library items: [{ id, title, summary, tags, key_points, url }]
 */
export async function findTopMatches(notes, library) {
  if (!library.length) return [];

  const compactLibrary = library.map((v) => ({
    id: v.id,
    title: v.title,
    summary: v.summary || '',
    tags: v.tags || [],
    key_points: v.key_points || [],
  }));

  const prompt = `You help a sales rep pick the most useful founder-channel videos to send a prospect after a call.

PROSPECT NOTES (what they said, their pain points, role, industry, stage):
"""
${notes}
"""

VIDEO LIBRARY (JSON — each video has title, summary, tags, and key_points):
${JSON.stringify(compactLibrary)}

Pick the TOP 3 videos that are most relevant to this specific prospect. The "key_points" array on each video lists specific things actually covered — use those to ground your match against the prospect's stated problems. For each pick, write a 1-2 sentence reason that explicitly references something the prospect said AND something specific from the video's key_points or summary. Be concrete — never say "this is a great overview".

Return ONLY a JSON array of exactly 3 items, ordered best match first:
[
  { "id": "<video id from the library>", "reason": "<why this fits THIS prospect>" }
]

If the library has fewer than 3 videos, return as many as exist. Use video ids exactly as given.`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = parseJson(textFromMessage(msg));
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array of matches');

  const byId = new Map(library.map((v) => [v.id, v]));
  const results = [];
  for (const item of parsed) {
    if (!item?.id) continue;
    const video = byId.get(item.id);
    if (!video) continue;
    results.push({ ...video, reason: item.reason || '' });
    if (results.length >= 3) break;
  }
  return results;
}
