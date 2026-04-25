import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findTopMatches } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const { data: library, error } = await supabase
    .from('videos')
    .select('id, title, url, summary, tags, key_points, thumbnail');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!library || library.length === 0) {
    return NextResponse.json(
      { error: 'Library is empty. Import some videos first.' },
      { status: 400 }
    );
  }

  try {
    const matches = await findTopMatches(notes, library);
    return NextResponse.json({ matches });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Failed to generate matches' }, { status: 500 });
  }
}
