'use client';

import { useEffect, useMemo, useState } from 'react';
import VideoCard from './VideoCard';

const DEFAULT_CHANNEL = 'https://www.youtube.com/@DanielIlesbiz';

export default function LibraryTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Coverage check state
  const [checking, setChecking] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [coverageError, setCoverageError] = useState('');

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

  async function runCoverage() {
    setChecking(true);
    setCoverageError('');
    setCoverage(null);
    try {
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: DEFAULT_CHANNEL }),
      });
      const data = await res.json();
      if (!res.ok) setCoverageError(data.error || `Coverage check failed (${res.status})`);
      else setCoverage(data);
    } catch (e) {
      setCoverageError(e.message);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) => {
      const hay = [v.title, v.summary, ...(v.tags || []), ...(v.key_points || [])]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [videos, query]);

  const enrichedCount = useMemo(
    () => videos.filter((v) => (v.key_points || []).length > 0).length,
    [videos]
  );
  const transcriptCount = useMemo(
    () => videos.filter((v) => v.has_transcript).length,
    [videos]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, summary, key points, or tag…"
          className="flex-1 min-w-[200px] p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <button
          onClick={load}
          className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
        >
          Refresh
        </button>
        <button
          onClick={runCoverage}
          disabled={checking}
          className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          title={`Compare ${DEFAULT_CHANNEL} against the database`}
        >
          {checking ? 'Checking…' : 'Coverage check'}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        {loading
          ? 'Loading…'
          : `${filtered.length} of ${videos.length} videos · ${enrichedCount} fully enriched · ${transcriptCount} with transcripts`}
      </p>

      {coverageError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {coverageError}
        </div>
      )}

      {coverage && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm space-y-2">
          <div className="font-medium text-slate-900">
            Channel has {coverage.channelTotal} videos · DB has {coverage.dbTotal} ·{' '}
            <span className={coverage.missing.length ? 'text-amber-700' : 'text-emerald-700'}>
              {coverage.missing.length} missing
            </span>
            {coverage.extra.length > 0 && (
              <>
                {' · '}
                <span className="text-slate-500">{coverage.extra.length} extra in DB</span>
              </>
            )}
          </div>
          {coverage.missing.length > 0 && (
            <details className="text-slate-700">
              <summary className="cursor-pointer hover:text-slate-900">
                Show {coverage.missing.length} missing videos
              </summary>
              <ul className="mt-2 space-y-1 max-h-64 overflow-auto pl-2">
                {coverage.missing.map((v) => (
                  <li key={v.videoId} className="text-xs">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {v.title}
                    </a>
                    {v.publishedAt && (
                      <span className="text-slate-500"> · {v.publishedAt.slice(0, 10)}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                To pull these in, go to the Import tab and run an import with Max set to{' '}
                {Math.max(coverage.channelTotal, 100)}+.
              </p>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((v) => (
          <VideoCard key={v.id} video={v} showKeyPoints />
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
