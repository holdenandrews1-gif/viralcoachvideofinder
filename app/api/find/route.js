import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findTopMatches } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Find best video matches for a prospect.
 *
 * Body:
 *   notes: string (required)
 *   minDurationSeconds?: number  — videos shorter than this are excluded
 *                                  (default 300 = 5 min, since the focus is
 *                                  long-form recommendations)
 *   excludeIds?: string[]        — video IDs to exclude (used by Refine)
 *   refinement?: string          — free-form rep feedback for course-correction
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const notes = (body.notes || '').trim();
  if (!notes) {
    return NextResponse.json({ error: 'Prospect notes are required.' }, { status: 400 });
  }

  const minDuration = Number.isFinite(body.minDurationSeconds)
    ? Math.max(0, Math.floor(body.minDurationSeconds))
    : 300;
  const excludeIds = new Set(
    Array.isArray(body.excludeIds) ? body.excludeIds.filter((s) => typeof s === 'string') : []
  );
  const refinement = typeof body.refinement === 'string' ? body.refinement.trim() : '';

  const { data: library, error } = await supabase
    .from('videos')
    .select('id, title, url, summary, tags, key_points, thumbnail, duration_seconds')
    .range(0, 4999);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!library || library.length === 0) {
    return NextResponse.json(
      { error: 'Library is empty. Import some videos first.' },
      { status: 400 }
    );
  }

  // Apply min-duration filter and exclude list. Videos with unknown
  // duration are excluded — once the rep runs Backfill durations all
  // legacy rows will have a real value.
  const filtered = library.filter((v) => {
    if (excludeIds.has(v.id)) return false;
    if (minDuration > 0 && (v.duration_seconds == null || v.duration_seconds < minDuration)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return NextResponse.json({
      matches: [],
      libraryFiltered: 0,
      libraryTotal: library.length,
      excludedCount: excludeIds.size,
      message:
        excludeIds.size > 0
          ? 'Every qualifying video has already been shown — start a fresh search to clear refinement.'
          : 'No videos in the library match the duration filter.',
    });
  }

  try {
    const matches = await findTopMatches(notes, filtered, refinement);
    return NextResponse.json({
      matches,
      libraryFiltered: filtered.length,
      libraryTotal: library.length,
      excludedCount: excludeIds.size,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || 'Failed to generate matches' },
      { status: 500 }
    );
  }
}
