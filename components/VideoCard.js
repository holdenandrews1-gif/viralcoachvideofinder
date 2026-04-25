function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoCard({ video, reason, showKeyPoints = false }) {
  const duration = formatDuration(video.duration_seconds);
  const points = video.key_points || [];

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md hover:border-slate-300 transition"
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
            {duration && (
              <span className="text-xs text-slate-500 whitespace-nowrap mt-0.5">{duration}</span>
            )}
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
                <li key={i} className="line-clamp-2">{p}</li>
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
  );
}
