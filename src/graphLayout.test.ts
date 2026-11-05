import { expect, it } from "vitest";
import { layoutCommits } from "./graphLayout";
import type { Commit } from "./model";
const c = (sha: string, parents: string[] = []): Commit => ({projectId:"p",sha,parents,missingParents:[],label:sha,timestamp:1});
it("splits real merges and converges shared parents without connecting unrelated roots", () => {
  const graph = layoutCommits([c("merge",["main","side"]),c("main",["base"]),c("side",["base"]),c("base"),c("unrelated")]);
  expect(graph.width).toBe(2);
  expect(graph.rows[0].edges.filter(e=>e.kind==="parent").map(e=>e.to)).toEqual([0,1]);
  expect(graph.rows[2].edges).toContainEqual({from:1,to:0,kind:"parent"});
  expect(graph.rows[4].edges).toEqual([]);
});
it("draws boundaries for off-page/missing parents, never invented edges", () => {
  const graph=layoutCommits([c("tip",["missing","offpage"])]);
  expect(graph.rows[0].boundaries).toEqual(["missing","offpage"]);
  expect(graph.rows[0].edges.filter(e=>e.kind==="parent")).toHaveLength(0);
});
it("handles octopus merges and keeps every parent identity", () => {
  const graph=layoutCommits([c("merge",["a","b","c"]),c("a",["root"]),c("b",["root"]),c("c",["root"]),c("root")]);
  expect(graph.rows[0].edges.filter(e=>e.kind==="parent")).toHaveLength(3);
  expect(graph.width).toBe(3);
  expect(graph.rows.at(-1)?.edges).toEqual([{from:0,to:0,kind:"incoming"}]);
});
it("marks incoming continuation from earlier pages and one boundary per parent", () => {
  const graph=layoutCommits([c("middle",["a","b"])],{middle:["child"]});
  expect(graph.rows[0].edges.filter(e=>e.kind==='earlier')).toHaveLength(1);
  expect(graph.rows[0].edges.filter(e=>e.kind==='boundary').map(e=>e.to)).toEqual([1,2]);
});
