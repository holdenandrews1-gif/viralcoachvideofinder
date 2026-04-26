import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractVideoId, fetchVideoById } from '@/lib/youtube';
import { fetchTranscript } from '@/lib/transcripts';
import { summarizeFromTranscript } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Enrich up to `batch` videos that don't yet have a summary or key_points.
 * For each video: fetch transcript (best-effort), call Claude to generate
 * { summary, tags, key_points }, save back to Supabase.
 *
 * The UI calls this in a loop until `remaining === 0`. Splitting work into
 * small batches keeps each request well under Vercel's function timeout
 * even on channels with 100s of videos.
 *
 * Body: { batch?: number = 5, force?: boolean = false }
 *   force=true reprocesses videos that already have summaries (re-enrich-all).
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const batch = Math.min(Math.max(parseInt(body.batch, 10) || 5, 1), 10);
  const force = body.force === true;

  // Pick the next batch of videos to process.
  let query = supabase
    .from('videos')
    .select('id, title, url, thumbnail, summary, key_points, transcript')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(batch);

  if (!force) {
    // "Unenriched" = summary is null/empty OR key_points array is empty.
    query = query.or('summary.is.null,summary.eq.,key_points.eq.{}');
  }

  const { data: candidates, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    // Also report total remaining so the UI can stop polling.
    const { count } = await supabase
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .or('summary.is.null,summary.eq.,key_points.eq.{}');
    return NextResponse.json({
      processed: 0,
      remaining: count || 0,
      results: [],
    });
  }

  const results = [];

  // Process sequentially. Concurrency is tempting but each transcript fetch
  // hits youtube and we want to avoid rate-limit issues; one at a time is
  // safer and 5 videos completes in well under a minute.
  for (const v of candidates) {
    const videoId = extractVideoId(v.url);
    if (!videoId) {
      results.push({ id: v.id, status: 'skipped', reason: 'no videoId' });
      continue;
    }

    let transcriptText = v.transcript || null;
    let transcriptStatus = transcriptText ? 'cached' : 'fetching';
    if (!transcriptText) {
      const t = await fetchTranscript(videoId);
      transcriptText = t?.text || null;
      transcriptStatus = t ? `fetched (${t.source})` : 'unavailable';
    }

    // Pull description as a fallback only if no transcript.
    let description = '';
    if (!transcriptText) {
      try {
        const meta = await fetchVideoById(videoId);
        description = meta?.description || '';
      } catch (e) {
        // Non-fatal.
      }
    }

    let summary = '';
    let tags = [];
    let key_points = [];
    let summaryError = null;
    try {
      const out = await summarizeFromTranscript({
        videoId,
        title: v.title,
        transcript: transcriptText,
        description,
      });
      summary = out.summary;
      tags = out.tags;
      key_points = out.key_points;
    } catch (e) {
      summaryError = e.message;
    }

    // Always write back something — even on failure we want to record the
    // transcript fetch outcome so the next enrich pass can move on.
    const update = {
      transcript: transcriptText,
    };
    if (!summaryError) {
      update.summary = summary;
      update.tags = tags;
      update.key_points = key_points;
    }

    const { error: updateErr } = await supabase
      .from('videos')
      .update(update)
      .eq('id', v.id);

    results.push({
      id: v.id,
      title: v.title,
      transcript: transcriptStatus,
      status: summaryError ? 'summary_failed' : 'ok',
      error: summaryError || (updateErr ? updateErr.message : null),
      keyPointsCount: key_points.length,
    });
  }

  // How many are still unenriched after this batch?
  const { count: remaining } = await supabase
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .or('summary.is.null,summary.eq.,key_points.eq.{}');

  return NextResponse.json({
    processed: results.length,
    remaining: force ? 0 : remaining || 0,
    results,
  });
}
