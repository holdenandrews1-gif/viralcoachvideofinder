import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractVideoId, fetchVideoById } from '@/lib/youtube';
import { fetchTranscript } from '@/lib/transcripts';
import { summarizeFromTranscript } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Enrich up to `batch` videos. Three selection modes:
 *
 *   mode='missing'        — pick videos that lack a summary or key_points
 *                           (the default; what "Enrich missing summaries" calls)
 *   mode='retryTranscripts' — pick videos where transcript is null. For each,
 *                           retry Supadata; if it succeeds, regenerate summary
 *                           + key_points off the new transcript. Skip if
 *                           transcript still can't be fetched (don't burn
 *                           Anthropic tokens regenerating an existing
 *                           description-based summary).
 *   force=true            — pick the next batch regardless of state and re-run
 *                           Claude on cached transcripts. Doesn't burn Supadata
 *                           credits because cached transcripts are reused.
 *
 * The UI calls this in a loop until `remaining === 0`. Splitting work into
 * small batches keeps each request well under Vercel's function timeout
 * even on channels with hundreds of videos.
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const batch = Math.min(Math.max(parseInt(body.batch, 10) || 5, 1), 10);
  const force = body.force === true;
  const mode = body.mode === 'retryTranscripts' ? 'retryTranscripts' : 'missing';

  // Build the "remaining" filter once — used both to pick the next batch and
  // to report progress to the UI.
  function applyRemainingFilter(q) {
    if (mode === 'retryTranscripts') {
      return q.is('transcript', null);
    }
    return q.or('summary.is.null,summary.eq.,key_points.eq.{}');
  }

  // Pick the next batch of videos to process.
  let query = supabase
    .from('videos')
    .select('id, title, url, thumbnail, summary, key_points, transcript')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(batch);

  if (!force) {
    query = applyRemainingFilter(query);
  }

  const { data: candidates, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    let remainingCount = 0;
    if (!force) {
      const { count } = await applyRemainingFilter(
        supabase.from('videos').select('*', { count: 'exact', head: true })
      );
      remainingCount = count || 0;
    }
    return NextResponse.json({
      processed: 0,
      remaining: remainingCount,
      results: [],
    });
  }

  const results = [];

  // Process sequentially. Concurrency would speed things up but each Supadata
  // call costs a credit and we want to be predictable. 5 videos completes well
  // under 60s.
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

    // In retryTranscripts mode, skip videos where Supadata still can't get
    // the transcript — don't waste Anthropic tokens regenerating the
    // existing summary, and don't lie about progress.
    if (mode === 'retryTranscripts' && !transcriptText) {
      results.push({
        id: v.id,
        title: v.title,
        transcript: transcriptStatus,
        status: 'no_transcript',
        keyPointsCount: (v.key_points || []).length,
      });
      continue;
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

    const update = { transcript: transcriptText };
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

  // How many are still unprocessed in this mode?
  let remaining = 0;
  if (!force) {
    // For retryTranscripts mode, "remaining" is more nuanced: even successful
    // fetches drop a video out of `transcript IS NULL`, but failures leave it
    // in. We need to subtract the failures we just had so the loop terminates.
    const failuresThisBatch = results.filter((r) => r.status === 'no_transcript').length;
    const { count } = await applyRemainingFilter(
      supabase.from('videos').select('*', { count: 'exact', head: true })
    );
    remaining = Math.max(0, (count || 0) - failuresThisBatch);
  }

  return NextResponse.json({
    processed: results.length,
    remaining: force ? 0 : remaining,
    results,
    mode,
  });
}
