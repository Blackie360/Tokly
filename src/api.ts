import { invoke, isTauri } from "@tauri-apps/api/core";
import { empty, type Snapshot } from "./model";
export const native = isTauri();
const key = "tokly-preview-v1";
function read(): Snapshot {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved) return structuredClone(empty);
    return {...empty, ...saved, commits: (saved.commits || []).map((c: Snapshot["commits"][number]) => ({...c, parents: c.parents || [], missingParents: c.missingParents || []})), projects: saved.projects.map((p: Snapshot["projects"][number]) => ({...p, lastCommit: p.lastCommit ?? null}))};
  } catch {
    return structuredClone(empty);
  }
}
function write(s: Snapshot) {
  localStorage.setItem(key, JSON.stringify(s));
}
export async function call<T = void>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (native) return invoke<T>(command, args);
  const s = read();
  switch (command) {
    case "confirm_action":
      return window.confirm(String(args.message)) as T;
    case "installed_editors":
      return [{id: "com.microsoft.VSCode", name: "Visual Studio Code"}, {id: "dev.zed.Zed", name: "Zed"}] as T;
    case "set_preferred_editor":
      s.preferredEditor = String(args.editor);
      break;
    case "git_graph": {
      const project = s.projects.find(p => p.id === args.id);
      if (!project) throw new Error("Project unavailable");
      const commits = s.commits.filter(c => c.projectId === args.id);
      const offset = Number(args.offset || 0);
      const graph = s.gitHistory.find(h => h.projectId === args.id);
      return {earlierChildren: {}, commits: commits.slice(offset,offset+50), refs: [{name:project.branch,sha:graph?.headSha || commits[0]?.sha || "",kind:"local"}], headSha:graph?.headSha || commits[0]?.sha || null,headLabel:project.branch,shallow:graph?.shallow || false,total:commits.length,offset,nextOffset:offset+50<commits.length?offset+50:null,generation:"preview",warnings:[]} as T;
    }
    case "snapshot":
      return s as T;
    case "add_root":
      throw new Error(
        "Folder access is available in the macOS desktop app. Use the sample workspace to explore this preview.",
      );
    case "save_note":
      s.projects = s.projects.map((p) =>
        p.id === args.id ? { ...p, note: String(args.note) } : p,
      );
      break;
    case "exclude_project":
      s.projects = s.projects.map((p) =>
        p.id === args.id ? { ...p, excluded: Boolean(args.excluded) } : p,
      );
      break;
    case "pin_project":
      s.projects = s.projects.map((p) => p.id === args.id ? {...p, pinned: Boolean(args.pinned)} : p);
      break;
    case "set_history_days":
      if (![7,30,90].includes(Number(args.days))) throw new Error("Choose 7, 30 or 90 days.");
      s.historyDays = Number(args.days);
      break;
    case "set_retention":
      s.retentionDays = Number(args.days);
      break;
    case "remove_root":
      s.roots = s.roots.filter((r) => r !== args.path);
      s.projects = s.projects.filter((p) =>
        s.roots.some((r) => p.id === r || p.id.startsWith(r + "/")),
      );
      s.activity = s.activity.filter((a) =>
        s.projects.some((p) => p.id === a.projectId),
      );
      s.commits = s.commits.filter((a) =>
        s.projects.some((p) => p.id === a.projectId),
      );
      break;
    case "rescan":
      break;
    case "open_project":
      throw new Error(
        "Opening local projects is available in the desktop app.",
      );
    default:
      throw new Error("Unknown action");
  }
  write(s);
  return undefined as T;
}
export function sample() {
  const time = Math.floor(Date.now() / 1000);
  const names = ["Care Clarity", "Piko Pi Agent", "Cursor Kenya", "Tokly"];
  const slugs = ["care-clarity", "piko-pi-agent", "cursor-kenya", "tokly"];
  const notes = [
    "Add explanations for the remaining terms.",
    "Test the WhatsApp task interruption flow.",
    "Review the workshop resource page.",
    "Polish the saved-step experience.",
  ];
  const branches = [
    "feature/ml-foundations",
    "feat/streaming",
    "main",
    "feat/desktop",
  ];
  const projects = names.map((name, i) => ({
    id: "/Users/you/Projects/" + slugs[i],
    name,
    branch: branches[i],
    changedFiles:
      i === 0
        ? ["ml/detector.py", "ml/terms.csv", "README.md"]
        : i === 1
          ? ["src/agent.ts"]
          : [],
    note: notes[i],
    lastActivity: time - [720, 3600, 10800, 86400][i],
    excluded: false,
    available: true,
    pinned: false,
    lastCommit: time - 3600,
  }));
  const labels = [
    "ml/terms.csv",
    "src/agent.ts",
    "resources.md",
    "src/App.tsx",
  ];
  const activity = Array.from({ length: 31 }, (_, i) => ({
    id: i + 1,
    projectId: projects[i % 4].id,
    kind: "file",
    label: labels[i % 4],
    timestamp: time - 720 - i * 16000,
  }));
  const commits = Array.from({ length: 14 }, (_, i) => ({
    projectId: projects[i % 4].id,
    parents: [] as string[], missingParents: [] as string[],
    sha: (i.toString(16) + "a97c4b2").padEnd(40, "0"),
    label: [
      "Expand term explanations",
      "Add task interruption",
      "Update workshop resources",
      "Build project overview",
    ][i % 4],
    timestamp: time - 3600 - i * 32000,
  }));
  commits.push({parents: [], missingParents: [], projectId: projects[3].id, sha: "b".repeat(40), label: "Earlier desktop exploration", timestamp: time - 20 * 86400});
  for (const project of projects) {
    const ancestry = commits.filter(c => c.projectId === project.id);
    ancestry.forEach((c, i) => { c.parents = ancestry[i + 1] ? [ancestry[i + 1].sha] : []; });
  }
  write({
    ...empty,
    gitHistory: projects.map(p => ({projectId: p.id, headSha: commits.find(c => c.projectId === p.id)?.sha || null, shallow: false, truncated: false})),
    roots: ["/Users/you/Projects"],
    projects,
    activity,
    commits,
    lastScan: time,
  });
}
export function resetPreview() {
  localStorage.removeItem(key);
}
