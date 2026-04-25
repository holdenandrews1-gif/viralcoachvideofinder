'use client';

import { useState } from 'react';

export default function AddTab() {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function add() {
    setError('');
    setResult(null);
    if (!url.trim()) {
      setError('A YouTube URL is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/videos/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add video.');
      } else {
        setResult(data.video);
        setTitle('');
        setUrl('');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Title <span className="text-slate-400 font-normal">(optional — pulled from YouTube if blank)</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">YouTube URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>
      <button
        onClick={add}
        disabled={submitting}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Adding…' : 'Add to library'}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}
      {result && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded">
          Added <span className="font-medium">{result.title}</span> to the library.
        </div>
      )}
    </div>
  );
}
