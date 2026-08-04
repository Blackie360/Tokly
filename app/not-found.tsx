import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="page-frame" style={{ paddingBlock: "12vh" }}><div className="eyebrow">404 / Coordinate missing</div><h1 style={{ fontSize: "var(--text-2xl)", letterSpacing: "-0.07em", margin: "2rem 0" }}>No signal here.</h1><p className="muted">The requested route is outside the monitored grid.</p><Link className="button" href="/">Return home →</Link></main>;
}
