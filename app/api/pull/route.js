import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchVideoBatch } from '@/lib/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pull a specific list of YouTube video IDs into the library (metadata only,
 * same as the metadata phase of /api/import). Used by the "Pull missing
 * videos" button in the coverage section so the user can backfill just the
 * gap rather than re-importing the whole channel.
 *
 * Body: { videoIds: string[] }  (up to 200 at a time)
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const ids = Array.isArray(body.videoIds)
    ? body.videoIds.filter((s) => typeof s === 'string' && s.length === 11).slice(0, 200)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'videoIds (array of YouTube video IDs) is required' }, { status: 400 });
  }

  let videos;
  try {
    videos = await fetchVideoBatch(ids);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  if (videos.length === 0) {
    return NextResponse.json({ inserted: 0, requested: ids.length, message: 'No videos found' });
  }

  const rows = videos.map((v) => ({
    title: v.title,
    url: v.url,
    thumbnail: v.thumbnail,
    published_at: v.publishedAt || null,
    duration_seconds: v.durationSeconds ?? null,
  }));

  const { data, error } = await supabase
    .from('videos')
    .upsert(rows, { onConflict: 'url', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    inserted: data?.length || 0,
    requested: ids.length,
    found: videos.length,
  });
}
