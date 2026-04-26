import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveChannelId, fetchAllChannelVideoIds } from '@/lib/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Compare a YouTube channel's full upload list against what's in Supabase.
 * Returns counts and the actual diff so the UI can show "X missing" and
 * offer a one-click sync.
 *
 * Body: { channelUrl: string }
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const channelInput = (body.channelUrl || '').trim();
  if (!channelInput) {
    return NextResponse.json({ error: 'channelUrl is required' }, { status: 400 });
  }

  let channelId, channelVideos;
  try {
    channelId = await resolveChannelId(channelInput);
    channelVideos = await fetchAllChannelVideoIds(channelId);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const { data: dbRows, error } = await supabase.from('videos').select('id, url, title');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dbUrls = new Set((dbRows || []).map((r) => r.url));
  const channelUrls = new Set(channelVideos.map((v) => v.url));

  const missing = channelVideos.filter((v) => !dbUrls.has(v.url));
  const extra = (dbRows || []).filter((r) => !channelUrls.has(r.url));

  return NextResponse.json({
    channelId,
    channelTotal: channelVideos.length,
    dbTotal: dbRows?.length || 0,
    missing: missing.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      url: v.url,
      publishedAt: v.publishedAt,
    })),
    extra: extra.map((r) => ({ id: r.id, title: r.title, url: r.url })),
  });
}
