'use client';

import { useEffect, useMemo, useState } from 'react';
import VideoCard from './VideoCard';

export default function LibraryTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/videos');
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed to load library.');
      else setVideos(data.videos || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) => {
      const hay = [v.title, v.summary, ...(v.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [videos, query]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, summary, or tag…"
          className="flex-1 p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <button
          onClick={load}
          className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-slate-500">
        {loading
          ? 'Loading…'
          : `${filtered.length} of ${videos.length} videos`}
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-slate-500 text-sm italic">
            No videos yet. Use the Import tab to pull in a channel, or add one manually.
          </p>
        )}
      </div>
    </div>
  );
}
