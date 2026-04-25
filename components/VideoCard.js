export default function VideoCard({ video, reason }) {
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
          <h3 className="font-semibold text-slate-900 line-clamp-2">{video.title}</h3>
          {reason && (
            <p className="mt-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded p-2">
              <span className="font-medium">Why this fits:</span> {reason}
            </p>
          )}
          {video.summary && (
            <p className="mt-2 text-sm text-slate-600 line-clamp-3">{video.summary}</p>
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
