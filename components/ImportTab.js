'use client';

import { useState } from 'react';

const DEFAULT_CHANNEL = 'https://www.youtube.com/@DanielIlesbiz';

export default function ImportTab() {
  const [channelUrl, setChannelUrl] = useState(DEFAULT_CHANNEL);
  const [max, setMax] = useState(50);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0, inserted: 0 });
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');

  function appendLog(line) {
    setLog((l) => [...l, line].slice(-50));
  }

  async function runImport() {
    setError('');
    setLog([]);
    setProgress({ processed: 0, total: 0, inserted: 0 });
    setRunning(true);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl, max }),
      });

      if (!res.ok && !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Import failed (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            handleEvent(evt);
          } catch {
            appendLog(line);
          }
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  function handleEvent(evt) {
    if (evt.message) appendLog(evt.message);
    if (evt.stage === 'progress' || evt.stage === 'done') {
      setProgress({
        processed: evt.processed ?? 0,
        total: evt.total ?? 0,
        inserted: evt.inserted ?? 0,
      });
    }
    if (evt.stage === 'fetched') {
      setProgress((p) => ({ ...p, total: evt.total ?? 0 }));
    }
    if (evt.stage === 'error') setError(evt.message);
  }

  const pct = progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          YouTube channel URL
        </label>
        <input
          type="text"
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          placeholder="https://www.youtube.com/@HandleHere"
          className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <p className="text-xs text-slate-500 mt-1">
          Accepts @handles, /channel/UC… IDs, or /user/name URLs.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Max videos</label>
        <select
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
          className="p-2 border border-slate-300 rounded-md bg-white"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <button
        onClick={runImport}
        disabled={running}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? 'Importing…' : 'Import videos'}
      </button>

      {(running || progress.total > 0) && (
        <div className="space-y-1">
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            {progress.processed}/{progress.total} processed · {progress.inserted} saved
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-slate-900 text-slate-100 text-xs font-mono p-3 rounded max-h-48 overflow-auto">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
