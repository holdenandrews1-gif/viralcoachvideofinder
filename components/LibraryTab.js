'use client';

import { useEffect, useMemo, useState } from 'react';
import VideoCard from './VideoCard';

const DEFAULT_CHANNEL = 'https://www.youtube.com/@DanielIlesbiz';
const CHANNEL_KEY = 'vfb.lastChannel';
const MIN_DURATION_KEY = 'vfb.minDurationSeconds';

export default function LibraryTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Coverage check state
  const [coverageChannel, setCoverageChannel] = useState(DEFAULT_CHANNEL);
  const [checking, setChecking] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [coverageError, setCoverageError] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState(null);

  // Pick up the last-used channel from Import tab so coverage check defaults
  // to whichever channel the user most recently imported from.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(CHANNEL_KEY);
    if (saved) setCoverageChannel(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined' && coverageChannel) {
      window.localStorage.setItem(CHANNEL_KEY, coverageChannel);
    }
  }, [coverageChannel]);

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
    if (!coverageChannel.trim()) {
      setCoverageError('Enter a channel URL to check.');
      return;
    }
    setChecking(true);
    setCoverageError('');
    setCoverage(null);
    setPullResult(null);
    try {
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: coverageChannel.trim() }),
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

  async function pullMissing() {
    if (!coverage?.missing?.length) return;
    setPulling(true);
    setPullResult(null);
    setCoverageError('');
    try {
      const ids = coverage.missing.map((v) => v.videoId).filter(Boolean);
      const minDuration =
        typeof window !== 'undefined'
          ? parseInt(window.localStorage.getItem(MIN_DURATION_KEY) || '0', 10) || 0
          : 0;
      const res = await fetch('/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: ids, minDurationSeconds: minDuration }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCoverageError(data.error || `Pull failed (${res.status})`);
        return;
      }
      setPullResult(data);
      // Refresh both the library list and the coverage diff so the user sees
      // the gap close immediately.
      await load();
      await runCoverage();
    } catch (e) {
      setCoverageError(e.message);
    } finally {
      setPulling(false);
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
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="text"
          value={coverageChannel}
          onChange={(e) => setCoverageChannel(e.target.value)}
          placeholder="https://www.youtube.com/@HandleHere"
          className="flex-1 min-w-[240px] p-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <button
          onClick={runCoverage}
          disabled={checking}
          className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          title="Compare this channel against the database"
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
            <>
              <button
                onClick={pullMissing}
                disabled={pulling}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pulling
                  ? `Pulling ${coverage.missing.length} videos…`
                  : `Pull these ${coverage.missing.length} into the library`}
              </button>
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
                  After pulling, head to the Import tab and click "Enrich missing summaries" to
                  generate transcripts + AI summaries for the new rows.
                </p>
              </details>
            </>
          )}
          {pullResult && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
              Saved {pullResult.inserted} of {pullResult.requested} requested videos. Now go to the
              Import tab and click <span className="font-medium">"Enrich missing summaries"</span>{' '}
              to summarize them.
            </div>
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
