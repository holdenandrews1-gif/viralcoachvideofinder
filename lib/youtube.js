// Server-side helpers for the YouTube Data API v3.
// All calls must be made from API routes — never the browser — to avoid CORS
// issues and to keep the API key off the client.

const YT_API = 'https://www.googleapis.com/youtube/v3';

function requireKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not set');
  return key;
}

/**
 * Resolve a channel input (handle URL, /channel/UC..., /user/name, or raw ID/handle)
 * to a canonical YouTube channel ID.
 */
export async function resolveChannelId(input) {
  const key = requireKey();
  const trimmed = (input || '').trim();
  if (!trimmed) throw new Error('Channel URL or ID is required');

  // Already a channel ID
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(trimmed)) return trimmed;

  // /channel/UC...
  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]+)/i);
  if (channelMatch) return channelMatch[1];

  // /@handle  or  bare @handle  or  bare handle
  let handle = null;
  const handleUrl = trimmed.match(/youtube\.com\/@([A-Za-z0-9._-]+)/i);
  if (handleUrl) handle = handleUrl[1];
  else if (trimmed.startsWith('@')) handle = trimmed.slice(1);

  // /user/name  (legacy)
  const userMatch = trimmed.match(/youtube\.com\/user\/([A-Za-z0-9._-]+)/i);

  // /c/name  (custom)
  const customMatch = trimmed.match(/youtube\.com\/c\/([A-Za-z0-9._-]+)/i);

  // Try forHandle (preferred for @handles)
  if (handle) {
    const url = `${YT_API}/channels?part=id&forHandle=@${encodeURIComponent(handle)}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.items?.[0]?.id) return data.items[0].id;
  }

  // forUsername (legacy /user/...)
  if (userMatch) {
    const url = `${YT_API}/channels?part=id&forUsername=${encodeURIComponent(userMatch[1])}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.items?.[0]?.id) return data.items[0].id;
  }

  // Fallback to search for /c/name or anything else
  const query = customMatch ? customMatch[1] : (handle || trimmed);
  const searchUrl = `${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=1&key=${key}`;
  const res = await fetch(searchUrl);
  const data = await res.json();
  const id = data?.items?.[0]?.snippet?.channelId || data?.items?.[0]?.id?.channelId;
  if (id) return id;

  throw new Error(`Could not resolve channel from "${input}"`);
}

/** Get the "uploads" playlist for a channel ID. */
async function getUploadsPlaylistId(channelId) {
  const key = requireKey();
  const url = `${YT_API}/channels?part=contentDetails&id=${channelId}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  const playlistId = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error('Channel has no uploads playlist');
  return playlistId;
}

/**
 * Fetch up to `maxResults` recent videos from a channel.
 * Returns array of { videoId, title, description, thumbnail, publishedAt, url }.
 */
export async function fetchChannelVideos(channelId, maxResults = 50) {
  const key = requireKey();
  const playlistId = await getUploadsPlaylistId(channelId);

  const items = [];
  let pageToken = '';
  while (items.length < maxResults) {
    const remaining = maxResults - items.length;
    const pageSize = Math.min(50, remaining);
    const url = `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`YouTube API error: ${data.error.message}`);
    if (!data.items || data.items.length === 0) break;
    items.push(...data.items);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return items.slice(0, maxResults).map((item) => {
    const snippet = item.snippet || {};
    const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId;
    const thumbs = snippet.thumbnails || {};
    const thumbnail =
      thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null;
    return {
      videoId,
      title: snippet.title,
      description: snippet.description || '',
      thumbnail,
      publishedAt: snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  });
}

/** Pull metadata for a single video URL/ID. Used by the Add Manually flow. */
export function extractVideoId(input) {
  const trimmed = (input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function fetchVideoById(videoId) {
  const key = requireKey();
  const url = `${YT_API}/videos?part=snippet,contentDetails&id=${videoId}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item) return null;
  const s = item.snippet || {};
  const thumbs = s.thumbnails || {};
  const thumbnail =
    thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null;
  return {
    videoId,
    title: s.title,
    description: s.description || '',
    thumbnail,
    publishedAt: s.publishedAt,
    durationSeconds: parseISO8601Duration(item.contentDetails?.duration),
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/**
 * Convert YouTube's ISO 8601 duration ("PT4M13S", "PT1H2M3S") to seconds.
 * Returns null on parse failure.
 */
export function parseISO8601Duration(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

/**
 * Batch-fetch durations for up to 50 video IDs in a single API call.
 * Returns Map<videoId, seconds>.
 */
export async function fetchDurations(videoIds) {
  const key = requireKey();
  const map = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = `${YT_API}/videos?part=contentDetails&id=${chunk.join(',')}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn('Duration fetch failed:', data.error.message);
      continue;
    }
    for (const item of data.items || []) {
      const seconds = parseISO8601Duration(item.contentDetails?.duration);
      if (item.id) map.set(item.id, seconds);
    }
  }
  return map;
}

/**
 * Walk the entire uploads playlist and return every videoId + minimal
 * metadata. Used by the coverage check so we know exactly what's on the
 * channel right now.
 */
export async function fetchAllChannelVideoIds(channelId) {
  const key = requireKey();
  const playlistId = await getUploadsPlaylistId(channelId);
  const items = [];
  let pageToken = '';
  while (true) {
    const url = `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`YouTube API error: ${data.error.message}`);
    if (!data.items || data.items.length === 0) break;
    for (const item of data.items) {
      const snippet = item.snippet || {};
      const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId;
      if (!videoId) continue;
      items.push({
        videoId,
        title: snippet.title,
        publishedAt: snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return items;
}
