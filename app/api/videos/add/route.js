import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractVideoId, fetchVideoById } from '@/lib/youtube';
import { fetchTranscript } from '@/lib/transcripts';
import { summarizeFromTranscript } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const videoId = extractVideoId(urlInput);
  let canonicalUrl = urlInput;
  let title = titleInput;
  let description = '';
  let thumbnail = null;
  let publishedAt = null;
  let durationSeconds = null;

  if (videoId) {
    try {
      const meta = await fetchVideoById(videoId);
      if (meta) {
        canonicalUrl = meta.url;
        if (!title) title = meta.title;
        description = meta.description;
        thumbnail = meta.thumbnail;
        publishedAt = meta.publishedAt;
        durationSeconds = meta.durationSeconds;
      }
    } catch (e) {
      console.warn('YouTube metadata fetch failed:', e.message);
    }
  }

  if (!title) {
    return NextResponse.json(
      { error: 'Could not derive a title — please provide one.' },
      { status: 400 }
    );
  }

  // Try to grab the transcript so the summary is rich.
  let transcript = null;
  if (videoId) {
    const t = await fetchTranscript(videoId);
    transcript = t?.text || null;
  }

  // Generate summary + tags + key_points. Best-effort.
  let summary = '';
  let tags = [];
  let key_points = [];
  try {
    const out = await summarizeFromTranscript({
      videoId: videoId || canonicalUrl,
      title,
      transcript,
      description,
    });
    summary = out.summary;
    tags = out.tags;
    key_points = out.key_points;
  } catch (e) {
    console.warn('Summary generation failed:', e.message);
  }

  const { data, error } = await supabase
    .from('videos')
    .upsert(
      {
        title,
        url: canonicalUrl,
        summary,
        tags,
        key_points,
        thumbnail,
        transcript,
        published_at: publishedAt,
        duration_seconds: durationSeconds,
      },
      { onConflict: 'url' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ video: data });
}
