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
 *   maxDurationSeconds?: number  — videos longer than this are excluded
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
    : null;
  const maxDuration = Number.isFinite(body.maxDurationSeconds)
    ? Math.max(0, Math.floor(body.maxDurationSeconds))
    : null;
  const excludeIds = new Set(
    Array.isArray(body.excludeIds) ? body.excludeIds.filter((s) => typeof s === 'string') : []
  );
  const refinement = typeof body.refinement === 'string' ? body.refinement.trim() : '';

  const { data: library, error } = await supabase
    .from('videos')
    .select('id, title, url, summary, tags, key_points, thumbnail, duration_seconds');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!library || library.length === 0) {
    return NextResponse.json(
      { error: 'Library is empty. Import some videos first.' },
      { status: 400 }
    );
  }

  // Apply duration + exclude filters. Both buckets exclude videos with
  // unknown duration. Run /api/backfill-durations to populate the column
  // for legacy imports.
  const filtered = library.filter((v) => {
    if (excludeIds.has(v.id)) return false;
    const d = v.duration_seconds;
    if (minDuration !== null || maxDuration !== null) {
      if (d == null) return false;
    }
    if (minDuration !== null && d < minDuration) return false;
    if (maxDuration !== null && d > maxDuration) return false;
    return true;
  });

  if (filtered.length === 0) {
    return NextResponse.json({
      matches: [],
      libraryFiltered: 0,
      libraryTotal: library.length,
      message: 'No videos in the library match the duration filter.',
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
    return NextResponse.json({ error: e.message || 'Failed to generate matches' }, { status: 500 });
  }
}
