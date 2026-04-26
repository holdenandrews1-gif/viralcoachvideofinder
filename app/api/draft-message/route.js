import { NextResponse } from 'next/server';
import { draftOutreachMessage } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_FORMATS = new Set(['email', 'slack', 'linkedin', 'sms']);

/**
 * Draft an outreach message a sales rep can send to a prospect along with
 * a recommended video.
 *
 * Body:
 *   notes: string                              — the prospect notes used for the find
 *   video: { title, url, summary, key_points, reason? }
 *   format?: 'email' | 'slack' | 'linkedin' | 'sms'  (default 'email')
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const notes = (body.notes || '').trim();
  const video = body.video || {};
  const format = ALLOWED_FORMATS.has(body.format) ? body.format : 'email';

  if (!notes) {
    return NextResponse.json({ error: 'notes is required' }, { status: 400 });
  }
  if (!video.url || !video.title) {
    return NextResponse.json({ error: 'video.url and video.title are required' }, { status: 400 });
  }

  try {
    const message = await draftOutreachMessage({ notes, video, format });
    return NextResponse.json({ message, format });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Failed to draft message' }, { status: 500 });
  }
}
