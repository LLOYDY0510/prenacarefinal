export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="page-header">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton h-3 w-40 mt-2" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-12 mt-3" />
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="section-header">
          <div className="skeleton h-3.5 w-40" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
