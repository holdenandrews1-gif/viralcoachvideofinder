'use client';

import { useEffect, useState } from 'react';

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const FORMAT_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'slack', label: 'Slack / DM' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'sms', label: 'SMS' },
];

/**
 * VideoCard renders a single video. When `prospectNotes` is provided
 * (i.e. used in Find Videos), a "Draft message" button appears below the
 * card that generates an outreach message tying the prospect's notes to
 * the video's content.
 */
export default function VideoCard({ video, reason, showKeyPoints = false, prospectNotes }) {
  const duration = formatDuration(video.duration_seconds);
  const points = video.key_points || [];
  const showDraftAction = Boolean(prospectNotes && reason);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md hover:border-slate-300 transition">
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div className="flex flex-col sm:flex-row">
          {video.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail}
              alt=""
              className="w-full sm:w-48 h-32 sm:h-auto object-cover bg-slate-100 flex-shrink-0"
            />
          ) : (
            <div className="w-full sm:w-48 h-32 bg-slate-100 flex-shrink-0" />
          )}
          <div className="p-4 flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900 line-clamp-2">{video.title}</h3>
              <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0">
                {video.has_transcript && (
                  <span
                    className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5"
                    title="Has cached transcript"
                  >
                    📄
                  </span>
                )}
                {duration && (
                  <span className="text-xs text-slate-500 whitespace-nowrap">{duration}</span>
                )}
              </div>
            </div>

            {reason && (
              <p className="mt-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded p-2">
                <span className="font-medium">Why this fits:</span> {reason}
              </p>
            )}

            {video.summary && (
              <p className="mt-2 text-sm text-slate-600 line-clamp-3">{video.summary}</p>
            )}

            {showKeyPoints && points.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600 list-disc list-inside">
                {points.slice(0, 6).map((p, i) => (
                  <li key={i} className="line-clamp-2">
                    {p}
                  </li>
                ))}
              </ul>
            )}

            {video.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {video.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </a>

      {showDraftAction && (
        <DraftMessageSection prospectNotes={prospectNotes} video={{ ...video, reason }} />
      )}
    </div>
  );
}

function DraftMessageSection({ prospectNotes, video }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('email');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Cache so reopening doesn't re-call. Re-call only on format change or
  // explicit Regenerate.
  const [generatedFor, setGeneratedFor] = useState(null); // { format } when text matches

  async function generate(targetFormat = format) {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const res = await fetch('/api/draft-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: prospectNotes,
          video: {
            title: video.title,
            url: video.url,
            summary: video.summary,
            key_points: video.key_points,
            reason: video.reason,
          },
          format: targetFormat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Draft failed (${res.status})`);
      } else {
        setText(data.message || '');
        setGeneratedFor({ format: targetFormat });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open) {
      setOpen(true);
      // First open — generate.
      if (!text && !loading) generate(format);
    } else {
      setOpen(false);
    }
  }

  function changeFormat(newFormat) {
    setFormat(newFormat);
    if (open) generate(newFormat);
  }

  async function copyToClipboard() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError('Could not copy. Select the text manually and copy.');
    }
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50">
      <div className="px-4 py-2 flex items-center justify-between gap-2">
        <button
          onClick={toggle}
          className="text-sm text-indigo-700 hover:text-indigo-900 font-medium"
        >
          {open ? '× Close draft' : '✉ Draft message'}
        </button>
        {open && (
          <div className="flex items-center gap-2">
            <select
              value={format}
              onChange={(e) => changeFormat(e.target.value)}
              disabled={loading}
              className="text-xs p-1 border border-slate-300 rounded bg-white disabled:opacity-50"
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => generate(format)}
              disabled={loading}
              className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50"
              title="Generate a fresh draft"
            >
              ↻
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {loading && !text ? (
            <p className="text-sm text-slate-500 italic">Drafting…</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Generated message will appear here…"
                rows={Math.max(4, Math.min(12, text.split('\n').length + 1))}
                className="w-full p-2 text-sm border border-slate-300 rounded bg-white font-sans"
                disabled={loading}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  disabled={!text || loading}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <span className="text-xs text-slate-500">
                  Edit freely before sending — this is just a starting point.
                </span>
              </div>
            </>
          )}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
