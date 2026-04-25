'use client';

import { useState } from 'react';
import VideoCard from './VideoCard';

export default function FindTab() {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');

  async function findMatches() {
    setError('');
    setMatches([]);
    if (!notes.trim()) {
      setError('Paste some prospect notes first.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
      } else {
        setMatches(data.matches || []);
      }
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

      {matches.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="text-lg font-semibold text-slate-900">Top {matches.length} matches</h2>
          {matches.map((m) => (
            <VideoCard key={m.id} video={m} reason={m.reason} />
          ))}
        </div>
      )}
    </div>
  );
}
