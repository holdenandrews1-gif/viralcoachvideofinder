'use client';

import { useState } from 'react';
import VideoCard from './VideoCard';

const SHORT_FORM_MAX_SECONDS = 300; // <= 5 min = short-form
const LONG_FORM_MIN_SECONDS = 300; // > 5 min = long-form

export default function FindTab() {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [longResult, setLongResult] = useState(null);
  const [shortResult, setShortResult] = useState(null);
  const [error, setError] = useState('');

  // Refinement state
  const [refinement, setRefinement] = useState('');
  const [excludedIds, setExcludedIds] = useState([]); // array of all video ids shown so far
  const [refining, setRefining] = useState(false);

  async function findMatches({ refinementText = '', exclude = [] } = {}) {
    setError('');
    if (!notes.trim()) {
      setError('Paste some prospect notes first.');
      return;
    }
    const isRefinement = refinementText || exclude.length > 0;
    if (isRefinement) setRefining(true);
    else setLoading(true);

    try {
      const [longRes, shortRes] = await Promise.all([
        callFind({
          notes,
          minDurationSeconds: LONG_FORM_MIN_SECONDS,
          excludeIds: exclude,
          refinement: refinementText,
        }),
        callFind({
          notes,
          maxDurationSeconds: SHORT_FORM_MAX_SECONDS,
          excludeIds: exclude,
          refinement: refinementText,
        }),
      ]);
      setLongResult(longRes);
      setShortResult(shortRes);

      // Track every id we've shown so refinements exclude them.
      const newIds = [
        ...(longRes?.matches || []).map((m) => m.id),
        ...(shortRes?.matches || []).map((m) => m.id),
      ];
      setExcludedIds((prev) => Array.from(new Set([...prev, ...newIds])));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefining(false);
    }
  }

  // Fresh search: clear refinement state so we don't accidentally exclude
  // useful videos from a previous query.
  async function freshSearch() {
    setExcludedIds([]);
    setRefinement('');
    await findMatches();
  }

  async function refineSearch() {
    if (!refinement.trim()) {
      setError('Tell me what was off about the previous picks first.');
      return;
    }
    await findMatches({ refinementText: refinement, exclude: excludedIds });
  }

  const hasResults = Boolean(longResult || shortResult);
  const totalShown = excludedIds.length;

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
        onClick={freshSearch}
        disabled={loading || refining}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Finding matches…' : 'Find best videos'}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      {hasResults && (
        <div className="space-y-6 pt-2">
          <ResultSection
            title="Long-form recommendations"
            subtitle="5 minutes or longer"
            result={longResult}
            prospectNotes={notes}
          />
          <ResultSection
            title="Short-form recommendations"
            subtitle="Under 5 minutes"
            result={shortResult}
            prospectNotes={notes}
          />

          <RefinePanel
            refinement={refinement}
            setRefinement={setRefinement}
            onRefine={refineSearch}
            refining={refining}
            totalShown={totalShown}
          />
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, subtitle, result, prospectNotes }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500">
          {subtitle}
          {result?.libraryFiltered != null && result?.libraryTotal != null && (
            <>
              {' '}
              · {result.libraryFiltered} of {result.libraryTotal} videos considered
              {result?.excludedCount > 0 && ` (${result.excludedCount} excluded)`}
            </>
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
        <VideoCard key={m.id} video={m} reason={m.reason} prospectNotes={prospectNotes} />
      ))}
    </section>
  );
}

function RefinePanel({ refinement, setRefinement, onRefine, refining, totalShown }) {
  return (
    <section className="space-y-2 border-t border-slate-200 pt-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Not quite right? Refine these results.
        </h3>
        <span className="text-xs text-slate-500">
          {totalShown} video{totalShown === 1 ? '' : 's'} already shown will be excluded
        </span>
      </div>
      <textarea
        value={refinement}
        onChange={(e) => setRefinement(e.target.value)}
        placeholder="What was off about these picks? e.g. 'they're B2B not consumer', 'they already saw the hook video', 'they're more advanced than these assume'..."
        rows={3}
        className="w-full p-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        disabled={refining}
      />
      <button
        onClick={onRefine}
        disabled={refining || !refinement.trim()}
        className="px-4 py-2 bg-slate-700 text-white text-sm rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {refining ? 'Refining…' : 'Find different videos'}
      </button>
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
