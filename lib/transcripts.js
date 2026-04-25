// Wrapper around the `youtube-transcript` package with graceful failure
// modes. Lots of YouTube videos don't have captions (livestreams,
// age-restricted, captions disabled, very new uploads), so callers should
// always be ready for a null result and fall back to description-only
// summarization.

import { YoutubeTranscript } from 'youtube-transcript';

const MAX_CHARS = 30_000; // ~7.5k tokens — keeps prompts cheap and fast.

/**
 * Fetch the public caption track for a YouTube video.
 * Returns: { text, segments, language } on success, or null if no captions.
 * Never throws — failure is logged and returned as null.
 */
export async function fetchTranscript(videoId) {
  if (!videoId) return null;
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!segments || segments.length === 0) return null;

    const text = segments
      .map((s) => (s.text || '').replace(/\s+/g, ' '))
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!text) return null;

    return {
      text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '…' : text,
      fullLength: text.length,
      truncated: text.length > MAX_CHARS,
      segmentCount: segments.length,
    };
  } catch (e) {
    // Most common errors: "Transcript is disabled on this video" or
    // "Could not retrieve transcript" (HTML format change). Don't blow up
    // the import — just log and let the caller fall back.
    console.warn(`Transcript fetch failed for ${videoId}:`, e.message);
    return null;
  }
}
