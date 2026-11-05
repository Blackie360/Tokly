import type { Commit } from "./model";
export type Edge = { from: number; to: number; kind: "incoming" | "through" | "parent" | "boundary" | "earlier" };
export type GraphRow = { commit: Commit; lane: number; edges: Edge[]; boundaries: string[] };
// Lane slots track actual pending parent IDs. Unrelated consecutive rows are never joined.
export function layoutCommits(commits: Commit[], earlierChildren: Record<string,string[]> = {}) {
  const positions = new Map(commits.map((c, i) => [c.sha, i]));
  let lanes: (string | null)[] = [];
  let width = 1;
  const rows: GraphRow[] = commits.map((commit, index) => {
    let lane = lanes.indexOf(commit.sha);
    const incoming = lane >= 0;
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = commit.sha;
    }
    const before = [...lanes];
    const edges: Edge[] = incoming ? [{from: lane, to: lane, kind: "incoming"}] : [];
    (earlierChildren[commit.sha] || []).forEach((_, i) => edges.push({from:before.length+i,to:lane,kind:"earlier"}));
    lanes[lane] = null;
    const boundaries: string[] = [];
    for (const parent of commit.parents) {
      if ((positions.get(parent) ?? -1) <= index) { boundaries.push(parent); continue; }
      let target = lanes.indexOf(parent);
      if (target < 0) {
        target = lanes.indexOf(null);
        if (target < 0) target = lanes.length;
        lanes[target] = parent;
      }
      edges.push({from: lane, to: target, kind: "parent"});
    }
    before.forEach((sha, from) => {
      if (sha && sha !== commit.sha) edges.push({from, to: lanes.indexOf(sha), kind: "through"});
    });
    boundaries.forEach((_, i) => edges.push({from: lane, to: Math.max(lanes.length, lane + 1) + i, kind: "boundary"}));
    width = Math.max(width, before.length, lanes.length, ...edges.map(e=>Math.max(e.from,e.to)+1));
    while (lanes.at(-1) === null) lanes.pop();
    return {commit, lane, edges, boundaries};
  });
  return {rows, width};
}
