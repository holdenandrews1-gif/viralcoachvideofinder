import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractVideoId, fetchDurations } from '@/lib/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Fetch durations from YouTube for every video where duration_seconds IS NULL
 * and write them back. One YouTube API call per 50 videos. Costs ~0 quota
 * compared to the daily limit.
 *
 * Also writes any rows where the video was found-and-fetched but the
 * duration came back null (livestreams, deleted videos) so we don't keep
 * retrying them. Sentinel: 0. The find filter treats 0 as "Short" — which is
 * the safer default for sales follow-up.
 */
export async function POST() {
  const { data: rows, error } = await supabase
    .from('videos')
    .select('id, url, title')
    .is('duration_seconds', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ updated: 0, missing: 0, message: 'No rows missing duration.' });
  }

  // Map id -> videoId
  const idPairs = rows
    .map((r) => ({ id: r.id, videoId: extractVideoId(r.url), title: r.title }))
    .filter((p) => p.videoId);

  let durationMap;
  try {
    durationMap = await fetchDurations(idPairs.map((p) => p.videoId));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  let updated = 0;
  let stillMissing = 0;
  const errors = [];

  for (const p of idPairs) {
    const seconds = durationMap.get(p.videoId);
    if (seconds == null) {
      stillMissing += 1;
      continue;
    }
    const { error: upErr } = await supabase
      .from('videos')
      .update({ duration_seconds: seconds })
      .eq('id', p.id);
    if (upErr) {
      errors.push({ id: p.id, title: p.title, error: upErr.message });
    } else {
      updated += 1;
    }
  }

  return NextResponse.json({
    requested: rows.length,
    updated,
    missing: stillMissing,
    errors,
  });
}
