import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveChannelId, fetchChannelVideos } from '@/lib/youtube';
import { summarizeBatch } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel: allow up to 5 min for big imports.

const BATCH_SIZE = 15;

/**
 * Streams progress as newline-delimited JSON so the UI can show a real
 * progress bar. Each line is a JSON object — clients should split on \n.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const channelInput = (body.channelUrl || '').trim();
  const max = Math.min(Math.max(parseInt(body.max, 10) || 50, 1), 200);

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
        send({
          stage: 'fetched',
          message: `Fetched ${videos.length} videos. Generating AI summaries...`,
          total: videos.length,
        });

        let processed = 0;
        let inserted = 0;

        for (let i = 0; i < videos.length; i += BATCH_SIZE) {
          const batch = videos.slice(i, i + BATCH_SIZE);
          let summaries = [];
          try {
            summaries = await summarizeBatch(batch);
          } catch (e) {
            send({
              stage: 'warn',
              message: `Summary batch ${i / BATCH_SIZE + 1} failed: ${e.message}. Saving without summaries.`,
            });
            summaries = batch.map((v) => ({ videoId: v.videoId, summary: '', tags: [] }));
          }

          const summaryById = new Map(summaries.map((s) => [s.videoId, s]));
          const rows = batch.map((v) => {
            const s = summaryById.get(v.videoId) || {};
            return {
              title: v.title,
              url: v.url,
              summary: s.summary || '',
              tags: s.tags || [],
              thumbnail: v.thumbnail,
            };
          });

          const { data, error } = await supabase
            .from('videos')
            .upsert(rows, { onConflict: 'url' })
            .select('id');

          if (error) {
            send({ stage: 'warn', message: `DB upsert error: ${error.message}` });
          } else {
            inserted += data?.length || 0;
          }

          processed += batch.length;
          send({
            stage: 'progress',
            processed,
            total: videos.length,
            inserted,
            message: `Processed ${processed}/${videos.length} videos`,
          });
        }

        send({
          stage: 'done',
          processed,
          inserted,
          total: videos.length,
          message: `Imported ${inserted} videos (${processed} processed).`,
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
