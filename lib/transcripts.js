// Transcript fetcher with Supadata as the primary path and the free
// youtube-transcript scraper as a fallback (useful for local dev where
// residential IPs work, or if Supadata is down).
//
// Set SUPADATA_API_KEY in env to enable the paid path.

import { YoutubeTranscript } from 'youtube-transcript';

const MAX_CHARS = 30_000; // ~7.5k tokens — keeps prompts cheap.
const SUPADATA_BASE = 'https://api.supadata.ai/v1';

function trimAndTruncate(text) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) + '…' : cleaned;
}

/**
 * Fetch a transcript via Supadata. Returns null on failure (never throws).
 * Handles both immediate 200 responses and 202-async jobs (videos > 20 min).
 */
async function fetchViaSupadata(videoId, apiKey) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const qs = new URLSearchParams({ url: videoUrl, text: 'true' });
  const initUrl = `${SUPADATA_BASE}/transcript?${qs}`;

  let res;
  try {
    res = await fetch(initUrl, { headers: { 'x-api-key': apiKey } });
  } catch (e) {
    console.warn(`Supadata fetch network error for ${videoId}:`, e.message);
    return null;
  }

  // Direct success
  if (res.status === 200) {
    const data = await res.json().catch(() => null);
    return trimAndTruncate(data?.content);
  }

  // Async job for long videos — poll for ~45s then give up (next enrich
  // pass will retry).
  if (res.status === 202) {
    const data = await res.json().catch(() => null);
    const jobId = data?.jobId;
    if (!jobId) return null;
    for (let attempt = 0; attempt < 22; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      let pollRes;
      try {
        pollRes = await fetch(`${SUPADATA_BASE}/transcript/${jobId}`, {
          headers: { 'x-api-key': apiKey },
        });
      } catch {
        continue;
      }
      if (pollRes.status === 200) {
        const out = await pollRes.json().catch(() => null);
        return trimAndTruncate(out?.content);
      }
      if (pollRes.status >= 400 && pollRes.status !== 202) {
        const errText = await pollRes.text().catch(() => '');
        console.warn(`Supadata poll ${pollRes.status} for ${videoId}: ${errText.slice(0, 200)}`);
        return null;
      }
      // 202: still processing, keep polling
    }
    console.warn(`Supadata job timed out for ${videoId}, will retry next pass`);
    return null;
  }

  // Hard error — read body so the cause is logged (auth, billing, bad
  // URL, etc.) but don't blow up the import.
  const errText = await res.text().catch(() => '');
  console.warn(`Supadata ${res.status} for ${videoId}: ${errText.slice(0, 200)}`);
  return null;
}

/**
 * Free fallback path. Often blocked when called from a Vercel datacenter IP.
 */
async function fetchViaScraper(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!segments || segments.length === 0) return null;
    const text = segments
      .map((s) => (s.text || '').replace(/\s+/g, ' '))
      .filter(Boolean)
      .join(' ');
    return trimAndTruncate(text);
  } catch (e) {
    console.warn(`Scraper transcript fetch failed for ${videoId}:`, e.message);
    return null;
  }
}

/**
 * Public entry point. Returns { text, source } or null.
 *   source: 'supadata' | 'scraper'
 */
export async function fetchTranscript(videoId) {
  if (!videoId) return null;
  const supaKey = process.env.SUPADATA_API_KEY;
  if (supaKey) {
    const text = await fetchViaSupadata(videoId, supaKey);
    if (text) return { text, source: 'supadata' };
    // Don't fall back to the scraper if Supadata is configured — the scraper
    // basically never works from Vercel and the failure noise isn't useful.
    return null;
  }
  const text = await fetchViaScraper(videoId);
  if (text) return { text, source: 'scraper' };
  return null;
}
