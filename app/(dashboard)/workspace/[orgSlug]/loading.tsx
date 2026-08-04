export default function WorkspaceLoading() {
  return (
    <main id="main-content" className="loading-shell" aria-busy="true" aria-label="Loading workspace data">
      <div className="loading-line loading-line-short" />
      <div className="loading-line loading-line-title" />
      <div className="loading-grid">
        {Array.from({ length: 6 }, (_, index) => <div className="loading-card" key={index} />)}
      </div>
      <div className="loading-panel" />
      <span className="sr-only">Loading workspace data…</span>
    </main>
  );
}
