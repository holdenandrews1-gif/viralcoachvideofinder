import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractVideoId, fetchVideoById } from '@/lib/youtube';
import { summarizeBatch } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const titleInput = (body.title || '').trim();
  const urlInput = (body.url || '').trim();
  if (!urlInput) {
    return NextResponse.json({ error: 'A YouTube URL is required.' }, { status: 400 });
  }

  // Try to enrich with YouTube metadata when possible.
  const videoId = extractVideoId(urlInput);
  let canonicalUrl = urlInput;
  let title = titleInput;
  let description = '';
  let thumbnail = null;

  if (videoId) {
    try {
      const meta = await fetchVideoById(videoId);
      if (meta) {
        canonicalUrl = meta.url;
        if (!title) title = meta.title;
        description = meta.description;
        thumbnail = meta.thumbnail;
      }
    } catch (e) {
      // Non-fatal — manual add should still work without YT metadata.
      console.warn('YouTube metadata fetch failed:', e.message);
    }
  }

  if (!title) {
    return NextResponse.json(
      { error: 'Could not derive a title — please provide one.' },
      { status: 400 }
    );
  }

  // Generate summary + tags. Best-effort: if it fails, save the row anyway.
  let summary = '';
  let tags = [];
  try {
    const [s] = await summarizeBatch([
      { videoId: videoId || canonicalUrl, title, description },
    ]);
    if (s) {
      summary = s.summary;
      tags = s.tags;
    }
  } catch (e) {
    console.warn('Summary generation failed:', e.message);
  }

  const { data, error } = await supabase
    .from('videos')
    .upsert(
      { title, url: canonicalUrl, summary, tags, thumbnail },
      { onConflict: 'url' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ video: data });
}
