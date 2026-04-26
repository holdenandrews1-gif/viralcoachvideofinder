import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Fetch transcript so we can compute has_transcript, but strip the big
  // transcript text from the response — sending hundreds of KB to the
  // browser on every Library load isn't worth it.
  const { data, error } = await supabase
    .from('videos')
    .select(
      'id, title, url, summary, tags, key_points, thumbnail, duration_seconds, published_at, created_at, transcript'
    )
    .order('published_at', { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const videos = (data || []).map((v) => {
    const has_transcript = typeof v.transcript === 'string' && v.transcript.trim().length > 0;
    const { transcript: _drop, ...rest } = v;
    return { ...rest, has_transcript };
  });

  return NextResponse.json({ videos });
}
