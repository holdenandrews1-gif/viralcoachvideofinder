#!/usr/bin/env node
/**
 * Backfill missing YouTube transcripts using the free `youtube-transcript`
 * scraper. Run this on your laptop (NOT on Vercel) — YouTube blocks
 * datacenter IPs from hitting the public caption endpoint, but residential
 * IPs work fine.
 *
 * Setup:
 *   1) Make sure Node 18+ is installed:  node --version
 *   2) Clone this repo and cd into it.
 *   3) Run:  npm install
 *   4) Create a file called `.env` in the repo root with these two lines:
 *        NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
 *      (Same values you have in Vercel — copy from there.)
 *   5) Run:  npm run backfill-transcripts
 *
 * What it does:
 *   - Connects to Supabase
 *   - Picks every row where transcript IS NULL
 *   - For each, fetches the public caption track from YouTube
 *   - Writes the transcript back to the row
 *   - Skips and logs videos that genuinely have no captions
 *
 * After it finishes:
 *   - Open your deployed app → Import tab → click "Re-enrich all".
 *     That regenerates summaries + key_points off the now-cached
 *     transcripts. No Supadata cost (transcripts are reused).
 *
 * Resumable: if you interrupt with Ctrl-C, just re-run. It only touches
 * rows that still have transcript IS NULL.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { YoutubeTranscript } = require('youtube-transcript');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const POLITENESS_DELAY_MS = 1500; // pause between requests so YouTube doesn't rate-limit us
const MAX_TRANSCRIPT_CHARS = 30_000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\nMissing env vars. Create a `.env` file in the repo root with:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
  console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...\n');
  console.error('Tip: copy these from your Vercel project settings.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function extractVideoId(url) {
  const trimmed = (url || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!segments || segments.length === 0) return { ok: false, reason: 'no captions' };
    const text = segments
      .map((s) => (s.text || '').replace(/\s+/g, ' '))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!text) return { ok: false, reason: 'empty transcript' };
    const truncated =
      text.length > MAX_TRANSCRIPT_CHARS ? text.slice(0, MAX_TRANSCRIPT_CHARS) + '…' : text;
    return { ok: true, text: truncated, length: text.length };
  } catch (e) {
    return { ok: false, reason: e.message || String(e) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  process.stdout.write('Connecting to Supabase… ');

  const { data: rows, error } = await supabase
    .from('videos')
    .select('id, url, title')
    .is('transcript', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(0, 4999);

  if (error) {
    console.error('failed.\n');
    console.error('Supabase error:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('done.');
    console.log('No videos missing transcripts. Nothing to do.');
    return;
  }

  console.log('done.');
  const minutes = Math.ceil((rows.length * (POLITENESS_DELAY_MS + 2000)) / 60000);
  console.log(`Found ${rows.length} videos missing transcripts.`);
  console.log(`Estimated time: ~${minutes} minute${minutes === 1 ? '' : 's'}\n`);

  let success = 0;
  let unavailable = 0;
  let dbErrors = 0;
  const startedAt = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefix = `[${String(i + 1).padStart(rows.length.toString().length)}/${rows.length}]`;
    const videoId = extractVideoId(row.url);

    if (!videoId) {
      console.log(`${prefix} ⚠︎  ${truncateTitle(row.title)} — bad URL`);
      continue;
    }

    const result = await fetchTranscript(videoId);

    if (result.ok) {
      const { error: upErr } = await supabase
        .from('videos')
        .update({ transcript: result.text })
        .eq('id', row.id);

      if (upErr) {
        dbErrors += 1;
        console.log(`${prefix} ⚠︎  ${truncateTitle(row.title)} — DB error: ${upErr.message}`);
      } else {
        success += 1;
        console.log(
          `${prefix} ✓  ${truncateTitle(row.title)} (${result.length.toLocaleString()} chars)`
        );
      }
    } else {
      unavailable += 1;
      console.log(`${prefix} —  ${truncateTitle(row.title)} (${result.reason})`);
    }

    if (i < rows.length - 1) await sleep(POLITENESS_DELAY_MS);
  }

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log('');
  console.log(`Done in ${elapsedMin} min.`);
  console.log(`  ${success} transcripts fetched and saved`);
  console.log(`  ${unavailable} videos had no captions (livestream, captions disabled, etc.)`);
  if (dbErrors) console.log(`  ${dbErrors} database write errors`);
  console.log('');
  console.log('Next step: deployed app → Import tab → "Re-enrich all"');
  console.log('to regenerate summaries + key_points from the new transcripts.');
}

function truncateTitle(t) {
  const s = t || '(untitled)';
  return s.length > 65 ? s.slice(0, 62) + '…' : s;
}

main().catch((e) => {
  console.error('\nFatal error:', e.message || e);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
