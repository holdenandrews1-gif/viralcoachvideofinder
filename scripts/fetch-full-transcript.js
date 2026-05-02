#!/usr/bin/env node
/**
 * Fetch the FULL untruncated transcript for a single YouTube video and
 * save it to text files you can use as raw material (lead magnets,
 * blog posts, repurposed content, feeding to Claude/ChatGPT, etc.).
 *
 * Run on your laptop — YouTube blocks datacenter IPs from the public
 * caption endpoint, so this won't work on Vercel.
 *
 * Usage (from inside the cloned repo):
 *
 *   node scripts/fetch-full-transcript.js <youtube-url-or-id>
 *
 *   # examples
 *   node scripts/fetch-full-transcript.js https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   node scripts/fetch-full-transcript.js dQw4w9WgXcQ
 *   node scripts/fetch-full-transcript.js https://youtu.be/dQw4w9WgXcQ
 *
 * Or via npm:
 *
 *   npm run fetch-full-transcript -- https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *
 * Output: writes two files in a `transcripts/` folder next to where you run it:
 *
 *   transcripts/<videoId>.txt              — plain text (just the words)
 *   transcripts/<videoId>-timestamped.txt  — with [MM:SS] markers for navigation
 *
 * No env vars needed — this script doesn't touch Supabase, just YouTube
 * and the local filesystem.
 */

const fs = require('fs');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');

function extractVideoId(input) {
  const trimmed = (input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `[${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
  }
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('\nUsage: node scripts/fetch-full-transcript.js <youtube-url-or-id>\n');
    console.error('Examples:');
    console.error('  node scripts/fetch-full-transcript.js https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    console.error('  node scripts/fetch-full-transcript.js dQw4w9WgXcQ\n');
    process.exit(1);
  }

  const videoId = extractVideoId(input);
  if (!videoId) {
    console.error(`Could not extract a video ID from: ${input}`);
    process.exit(1);
  }

  console.log(`Fetching transcript for ${videoId}...`);
  let segments;
  try {
    segments = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (e) {
    console.error(`Transcript fetch failed: ${e.message}`);
    console.error('Common reasons: video has captions disabled, livestream, age-restricted, or removed.');
    process.exit(1);
  }

  if (!segments || segments.length === 0) {
    console.error('No transcript segments returned. Video may not have captions.');
    process.exit(1);
  }

  // Plain text — strip whitespace noise but preserve sentence flow.
  const plainText = segments
    .map((s) => (s.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

  // Timestamped text — one segment per line with [MM:SS] or [H:MM:SS] markers.
  const timestamped = segments
    .map((s) => `${formatTime(s.offset)} ${(s.text || '').replace(/\s+/g, ' ').trim()}`)
    .filter((line) => line.length > 8) // drop empty
    .join('\n');

  const outDir = path.join(process.cwd(), 'transcripts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const txtPath = path.join(outDir, `${videoId}.txt`);
  const tsPath = path.join(outDir, `${videoId}-timestamped.txt`);

  fs.writeFileSync(txtPath, plainText, 'utf8');
  fs.writeFileSync(tsPath, timestamped, 'utf8');

  // Stats
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const charCount = plainText.length;
  const lastTimestamp = segments[segments.length - 1];
  const durationMin = lastTimestamp
    ? Math.round((lastTimestamp.offset + (lastTimestamp.duration || 0)) / 60000)
    : null;
  const readingTimeMin = Math.round(wordCount / 200); // ~200 wpm reading speed

  console.log(`\nDone.`);
  console.log(`  Video ID:      ${videoId}`);
  console.log(`  Segments:      ${segments.length.toLocaleString()}`);
  if (durationMin != null) console.log(`  Video length:  ~${durationMin} minutes`);
  console.log(`  Transcript:    ${charCount.toLocaleString()} chars · ${wordCount.toLocaleString()} words`);
  console.log(`  Reading time:  ~${readingTimeMin} minutes\n`);
  console.log(`Saved to:`);
  console.log(`  ${txtPath}`);
  console.log(`  ${tsPath}\n`);
  console.log('Open either file with: open ' + txtPath);
}

main().catch((e) => {
  console.error('\nFatal:', e.message || e);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
