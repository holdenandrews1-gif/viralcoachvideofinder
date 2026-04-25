'use client';

import { useState } from 'react';

const DEFAULT_CHANNEL = 'https://www.youtube.com/@DanielIlesbiz';

export default function ImportTab() {
  const [channelUrl, setChannelUrl] = useState(DEFAULT_CHANNEL);
  const [max, setMax] = useState(50);
  const [phase, setPhase] = useState('idle'); // idle | importing | enriching | done | error
  const [importStatus, setImportStatus] = useState({ saved: 0, total: 0 });
  const [enrichStatus, setEnrichStatus] = useState({ processed: 0, remaining: 0, startedTotal: 0 });
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');

  function appendLog(line) {
    setLog((l) => [...l, line].slice(-80));
  }

  async function runImport() {
    setError('');
    setLog([]);
    setImportStatus({ saved: 0, total: 0 });
    setEnrichStatus({ processed: 0, remaining: 0, startedTotal: 0 });
    setPhase('importing');

    try {
      // Phase 1: fast metadata pull
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl, max }),
      });

      if (!res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Import failed (${res.status})`);
        setPhase('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let importErrored = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            appendLog(line);
            continue;
          }
          if (evt.message) appendLog(evt.message);
          if (evt.stage === 'save') {
            setImportStatus((s) => ({ ...s, total: evt.total ?? s.total }));
          }
          if (evt.stage === 'done') {
            setImportStatus({ saved: evt.inserted ?? 0, total: evt.total ?? 0 });
          }
          if (evt.stage === 'error') {
            setError(evt.message);
            importErrored = true;
          }
        }
      }

      if (importErrored) {
        setPhase('error');
        return;
      }

      // Phase 2: enrich loop
      await enrichLoop();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  async function enrichLoop({ force = false } = {}) {
    setPhase('enriching');
    let processed = 0;
    let startedTotal = null;

    while (true) {
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: 5, force }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || `Enrich failed (${res.status})`);
          setPhase('error');
          return;
        }

        if (startedTotal === null) {
          startedTotal = (data.processed || 0) + (data.remaining || 0);
        }

        processed += data.processed || 0;
        const remaining = data.remaining || 0;

        for (const r of data.results || []) {
          appendLog(
            `${r.status === 'ok' ? '✓' : '⚠︎'} ${r.title || r.id}` +
              (r.transcript ? ` [transcript: ${r.transcript}]` : '') +
              (r.keyPointsCount != null ? ` · ${r.keyPointsCount} key points` : '') +
              (r.error ? ` · ${r.error}` : '')
          );
        }

        setEnrichStatus({
          processed,
          remaining,
          startedTotal: startedTotal || processed + remaining,
        });

        if ((data.processed || 0) === 0 || remaining === 0) {
          appendLog(`Enrich complete. ${processed} videos enriched.`);
          setPhase('done');
          return;
        }
      } catch (e) {
        setError(e.message);
        setPhase('error');
        return;
      }
    }
  }

  const importPct = importStatus.total
    ? Math.round((importStatus.saved / importStatus.total) * 100)
    : 0;
  const enrichPct = enrichStatus.startedTotal
    ? Math.round((enrichStatus.processed / enrichStatus.startedTotal) * 100)
    : 0;

  const running = phase === 'importing' || phase === 'enriching';

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
          disabled={running}
          className="p-2 border border-slate-300 rounded-md bg-white disabled:opacity-50"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={runImport}
          disabled={running}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {phase === 'importing'
            ? 'Importing…'
            : phase === 'enriching'
            ? 'Enriching…'
            : 'Import videos'}
        </button>
        <button
          onClick={() => enrichLoop({ force: false })}
          disabled={running}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Enrich missing summaries
        </button>
        <button
          onClick={() => enrichLoop({ force: true })}
          disabled={running}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Re-summarize every video, even those that already have summaries."
        >
          Re-enrich all
        </button>
      </div>

      {(phase === 'importing' || importStatus.total > 0) && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Step 1: Pull metadata from YouTube
          </p>
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 transition-all"
              style={{ width: `${importPct}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            {importStatus.saved}/{importStatus.total || '?'} videos saved to database
          </p>
        </div>
      )}

      {(phase === 'enriching' || phase === 'done' || enrichStatus.startedTotal > 0) && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Step 2: Fetch transcripts + generate AI summaries
          </p>
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-600 h-2 transition-all"
              style={{ width: `${enrichPct}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            {enrichStatus.processed}/{enrichStatus.startedTotal} enriched ·{' '}
            {enrichStatus.remaining} remaining
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded">
          All done. Head to the Library or Find Videos tab.
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-slate-900 text-slate-100 text-xs font-mono p-3 rounded max-h-64 overflow-auto">
          {log.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
