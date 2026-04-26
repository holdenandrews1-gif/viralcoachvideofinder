'use client';

import { useState } from 'react';
import VideoCard from './VideoCard';

const SHORT_FORM_MAX_SECONDS = 300; // <= 5 min = short-form
const LONG_FORM_MIN_SECONDS = 300; // > 5 min = long-form

export default function FindTab() {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [longResult, setLongResult] = useState(null); // { matches, libraryFiltered, error }
  const [shortResult, setShortResult] = useState(null);
  const [error, setError] = useState('');

  async function findMatches() {
    setError('');
    setLongResult(null);
    setShortResult(null);
    if (!notes.trim()) {
      setError('Paste some prospect notes first.');
      return;
    }
    setLoading(true);
    try {
      // Fire both queries in parallel — long-form (5+ min) and short-form
      // (under 5 min) — so the user gets both lists at once.
      const [longRes, shortRes] = await Promise.all([
        callFind({ notes, minDurationSeconds: LONG_FORM_MIN_SECONDS }),
        callFind({ notes, maxDurationSeconds: SHORT_FORM_MAX_SECONDS }),
      ]);
      setLongResult(longRes);
      setShortResult(shortRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Prospect conversation notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did they say? What pain points came up? Who are they (role, industry, stage)?"
          className="w-full min-h-[180px] p-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>
      <button
        onClick={findMatches}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Finding matches…' : 'Find best videos'}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      {(longResult || shortResult) && (
        <div className="space-y-6 pt-2">
          <ResultSection
            title="Long-form recommendations"
            subtitle="5 minutes or longer"
            result={longResult}
          />
          <ResultSection
            title="Short-form recommendations"
            subtitle="Under 5 minutes"
            result={shortResult}
          />
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, subtitle, result }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500">
          {subtitle}
          {result?.libraryFiltered != null && result?.libraryTotal != null && (
            <> · {result.libraryFiltered} of {result.libraryTotal} videos considered</>
          )}
        </span>
      </div>

      {result?.error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {result.error}
        </div>
      )}

      {!result?.error && (result?.matches?.length || 0) === 0 && (
        <p className="text-sm text-slate-500 italic">
          {result?.message || 'No matches in this category.'}
        </p>
      )}

      {result?.matches?.map((m) => (
        <VideoCard key={m.id} video={m} reason={m.reason} />
      ))}
    </section>
  );
}

async function callFind(body) {
  try {
    const res = await fetch('/api/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || `Find failed (${res.status})` };
    return data;
  } catch (e) {
    return { error: e.message };
  }
}
