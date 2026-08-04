"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main-content" className="page-frame" style={{ paddingBlock: "12vh" }}><div className="eyebrow">System fault</div><h1 style={{ fontSize: "var(--text-xl)" }}>The dashboard could not complete that request.</h1><p className="muted">No usage data was changed. Retry the operation or check the service logs.</p><button className="button" type="button" onClick={reset}>Retry →</button></main>;
}
