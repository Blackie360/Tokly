import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { layoutCommits } from "./graphLayout";
import { call } from "./api";
import { relative, type GraphPage } from "./model";
const palette = ["#b9a2ff", "#86d9bd", "#f4bea7", "#8dbaf7", "#eaa6e0"];
export function CommitGraph({ projectId, refreshToken }: { projectId: string; refreshToken: number | null }) {
  const [page, setPage] = useState<GraphPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const request = useRef(0);
  const load = useCallback(async (offset = 0, generation: string | null = null, force = false) => {
    const ticket = ++request.current;
    setBusy(true); setError("");
    try {
      const result = await call<GraphPage>("git_graph", {id:projectId,offset,generation,force});
      if (ticket === request.current) { setPage(result); setStale(false); }
    } catch (e) { if (ticket === request.current) setError(String(e)); }
    finally { if (ticket === request.current) setBusy(false); }
  }, [projectId]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  // A background scan can discover moved refs. Revalidate page zero without interrupting pagination.
  useEffect(() => {
    let cancelled = false;
    if (!page || busy) return;
    void call<GraphPage>("git_graph", {id:projectId,offset:0,generation:null,force:false}).then(result => {
      if (!cancelled && result.generation !== page.generation) setStale(true);
    }).catch(() => { /* Explicit refresh reports access errors. */ });
    return () => { cancelled = true; };
  }, [refreshToken]);
  const graph = useMemo(() => layoutCommits(page?.commits || [], page?.earlierChildren), [page]);
  const x = (lane: number) => 12 + lane * 18;
  return <section className="commit-history" aria-label="Git commit graph" aria-busy={busy}>
    <div className="graph-heading"><h3>Every branch, connected</h3><button className="text-button" disabled={busy} onClick={() => void load(0,null,true)}>Refresh graph</button></div>
    <p className="small">All local Git history · no date limit</p>
    {busy && <p role="status">Reading local Git history…</p>}
    {error && <p role="alert">{error}</p>}
    {stale && <p role="status">Git references changed. Refresh the graph to load the new snapshot; your current page is preserved.</p>}
    {page && <><p className="small">HEAD: <strong>{page.headLabel}</strong> · {page.total.toLocaleString()} commits · {page.refs.length} references.</p>
    <details className="graph-refs"><summary>Branches and tags ({page.refs.length})</summary>{page.refs.map(ref => <p className="small" key={ref.kind+ref.name}><span className="ref-badge">{ref.kind} · {ref.name}</span> <code>{ref.sha.slice(0,7)}</code></p>)}</details>
    {page.shallow && <p role="status" className="small">Shallow checkout: earlier ancestry may be unavailable locally. Tokly does not fetch it.</p>}
    {page.warnings.map(warning => <p role="status" key={warning}>{warning}</p>)}
    <details className="graph-refs"><summary>About this graph</summary><p className="small">Includes history reachable from local branches, known remote branches, tags, other stored refs and HEAD. Tokly does not fetch remote history. Activity retention does not limit this graph.</p><p className="small">Lines follow actual parents; colors are visual guides, not branch names. Dashed stubs mark connections outside this page or missing locally. Expand parent details to inspect exact relationships.</p><p className="small">Pages contain up to 50 commits, with children before their parents. Unreachable objects and reflog-only history are not included.</p></details>
    {!page.total && <p role="status">No commits available from local references.</p>}
    <div className="graph-pagination"><button className="text-button" disabled={busy || page.offset === 0} onClick={() => void load(Math.max(0,page.offset-50),page.generation)}>Previous commits</button><span className="small">{page.total ? page.offset+1 : 0}–{page.offset+page.commits.length} of {page.total}</span><button className="text-button" disabled={busy || page.nextOffset === null} onClick={() => void load(page.nextOffset!,page.generation)}>Next commits</button></div>
    <div className="commit-graph-scroll" tabIndex={0} aria-label="Scrollable commit graph">
      <ol className="commit-graph-list">
        {graph.rows.map(({commit, lane, edges, boundaries}) => <li className="commit-graph-row" key={commit.sha}>
          <div className="commit-lanes" style={{width: x(graph.width) + 8}}>
            <svg aria-hidden="true" viewBox={`0 0 ${x(graph.width) + 8} 64`} preserveAspectRatio="none">
              {edges.map((edge, i) => <path key={i} stroke={palette[edge.from % palette.length]} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray={(edge.kind === "boundary" || edge.kind === "earlier") ? "3 3" : undefined} d={edge.kind === "earlier" ? `M${x(edge.from)} 12Q${x(edge.from)} 32 ${x(edge.to)} 32` : edge.kind === "incoming" ? `M${x(edge.from)} 0V32` : edge.kind === "through" ? `M${x(edge.from)} 0V64` : edge.kind === "boundary" ? `M${x(edge.from)} 32Q${x(edge.from)} 48 ${x(edge.to)} 48` : `M${x(edge.from)} 32C${x(edge.from)} 48 ${x(edge.to)} 48 ${x(edge.to)} 64`}/>)}
            </svg>
            <span aria-hidden="true" className="graph-node" style={{left:x(lane),top:"50%",background:palette[lane % palette.length]}}/>
            {edges.filter(e => e.kind === "boundary" || e.kind === "earlier").map((e,i) => <span aria-hidden="true" className="graph-node graph-boundary" key={i} style={{left:x(e.kind === "earlier" ? e.from : e.to),top:e.kind === "earlier" ? "18.75%" : "75%",borderColor:palette[lane % palette.length]}}/>)}
          </div>
          <div className="commit-message">
            <strong>{commit.label}</strong>
            <div className="commit-meta"><code>{commit.sha.slice(0,7)}</code>{page.headSha === commit.sha && <span className="head-badge">HEAD · {page.headLabel}</span>}{page.refs.filter(ref => ref.sha === commit.sha).map(ref => <span className="ref-badge" key={ref.kind+ref.name}>{ref.kind} · {ref.name}</span>)}<time dateTime={new Date(commit.timestamp * 1000).toISOString()} title={new Date(commit.timestamp * 1000).toLocaleString()}>{relative(commit.timestamp)}</time></div>
            <details><summary>{commit.parents.length > 1 ? `Merge · ${commit.parents.length} parents` : commit.parents.length === 1 ? "1 parent" : "Root commit"}{boundaries.length > 0 ? " · history boundary" : ""}</summary>
              <p className="small">Commit {commit.sha}</p>
              {page.earlierChildren[commit.sha]?.map(child => <p className="small" key={child}>Child <code>{child}</code> — on an earlier page</p>)}
              {commit.parents.map(parent => <p className="small" key={parent}>Parent <code>{parent}</code>{commit.missingParents.includes(parent) ? " — not traversed (shallow boundary or missing local object)" : boundaries.includes(parent) ? " — outside this page" : " — connected in graph"}</p>)}
              <p className="small">The full commit subject is shown above. Message bodies are not collected.</p>
            </details>
          </div>
        </li>)}
      </ol>
    </div>

    </>}
  </section>;
}
