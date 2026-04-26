import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveChannelId, fetchChannelVideos, fetchDurations } from '@/lib/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Fast metadata-only import. Pulls up to `max` recent videos from the
 * channel and saves them with empty summary/key_points. The UI then
 * polls /api/enrich to fill those in. Splitting metadata from AI work
 * keeps each request fast and predictable regardless of channel size.
 *
 * Optional filters:
 *   minDurationSeconds — skip videos shorter than this (default 0).
 *                        Use 240 to keep only 4+ minute videos, etc.
 *
 * Streams progress as newline-delimited JSON.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const channelInput = (body.channelUrl || '').trim();
  const max = Math.min(Math.max(parseInt(body.max, 10) || 50, 1), 500);
  const minDuration = Number.isFinite(body.minDurationSeconds)
    ? Math.max(0, Math.floor(body.minDurationSeconds))
    : 0;

  if (!channelInput) {
    return NextResponse.json({ error: 'channelUrl is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        send({ stage: 'resolve', message: `Resolving channel "${channelInput}"...` });
        const channelId = await resolveChannelId(channelInput);

        send({ stage: 'fetch', message: `Fetching up to ${max} videos...`, channelId });
        const videos = await fetchChannelVideos(channelId, max);

        send({ stage: 'durations', message: 'Fetching video durations...' });
        let durationMap = new Map();
        try {
          durationMap = await fetchDurations(videos.map((v) => v.videoId));
        } catch (e) {
          send({ stage: 'warn', message: `Duration fetch failed: ${e.message}` });
        }

        // Build candidate rows, then optionally filter by minimum length.
        const candidates = videos.map((v) => ({
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail,
          published_at: v.publishedAt || null,
          duration_seconds: durationMap.get(v.videoId) ?? null,
        }));

        let rows = candidates;
        let filteredOut = 0;
        if (minDuration > 0) {
          rows = candidates.filter((r) => {
            // Exclude both unknown durations and known-too-short ones.
            if (r.duration_seconds == null) return false;
            return r.duration_seconds >= minDuration;
          });
          filteredOut = candidates.length - rows.length;
          if (filteredOut > 0) {
            send({
              stage: 'filtered',
              message: `Filtered out ${filteredOut} videos shorter than ${Math.round(minDuration / 60)} min.`,
              filteredOut,
              kept: rows.length,
            });
          }
        }

        if (rows.length === 0) {
          send({
            stage: 'done',
            inserted: 0,
            total: 0,
            filteredOut,
            message: `No videos to save after filter.`,
          });
          return;
        }

        send({
          stage: 'save',
          message: `Saving ${rows.length} videos to the database...`,
          total: rows.length,
        });

        // Upsert. Note: this only writes the metadata columns we listed —
        // it does NOT touch summary/tags/key_points/transcript on existing
        // rows. /api/enrich fills those in.
        const { data, error } = await supabase
          .from('videos')
          .upsert(rows, { onConflict: 'url', ignoreDuplicates: false })
          .select('id');

        if (error) {
          send({ stage: 'error', message: `DB upsert error: ${error.message}` });
          return;
        }

        send({
          stage: 'done',
          inserted: data?.length || 0,
          total: rows.length,
          filteredOut,
          message: `Saved ${data?.length || 0} videos. Now enriching with transcripts + AI summaries...`,
        });
      } catch (e) {
        send({ stage: 'error', message: e.message || String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
