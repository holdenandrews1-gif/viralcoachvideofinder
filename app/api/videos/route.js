import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Defensive: explicit range so we don't silently cap at any project-level
  // PostgREST default. 5000 is well above any realistic library size.
  // Fetch transcript so we can compute has_transcript per row; strip the
  // text before responding so the payload stays small.
  const [rowsRes, countRes] = await Promise.all([
    supabase
      .from('videos')
      .select(
        'id, title, url, summary, tags, key_points, thumbnail, duration_seconds, published_at, created_at, transcript'
      )
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(0, 4999),
    supabase.from('videos').select('*', { count: 'exact', head: true }),
  ]);

  if (rowsRes.error) {
    return NextResponse.json({ error: rowsRes.error.message }, { status: 500 });
  }

  const data = rowsRes.data || [];
  const videos = data.map((v) => {
    const has_transcript = typeof v.transcript === 'string' && v.transcript.trim().length > 0;
    const { transcript: _drop, ...rest } = v;
    return { ...rest, has_transcript };
  });

  // dbCount is the authoritative row count regardless of pagination.
  const dbCount = countRes.error ? null : countRes.count ?? null;

  return NextResponse.json({
    videos,
    returned: videos.length,
    dbCount,
  });
}
