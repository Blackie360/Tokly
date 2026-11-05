export interface Project {
  id: string;
  name: string;
  branch: string;
  changedFiles: string[];
  note: string;
  lastActivity: number | null;
  excluded: boolean;
  available: boolean;
  pinned: boolean;
  lastCommit: number | null;
}
export interface Activity {
  id: number;
  projectId: string;
  kind: string;
  label: string;
  timestamp: number;
}
export interface GitHistory { projectId: string; headSha: string | null; shallow: boolean; truncated: boolean; }
export interface Commit {
  projectId: string;
  sha: string;
  parents: string[];
  missingParents: string[];
  label: string;
  timestamp: number;
}
export interface GitRef { name: string; sha: string; kind: "local" | "remote" | "tag" | "other"; }
export interface GraphPage { earlierChildren: Record<string,string[]>; commits: Commit[]; refs: GitRef[]; headSha: string | null; headLabel: string; shallow: boolean; total: number; offset: number; nextOffset: number | null; generation: string; warnings: string[]; }
export interface Editor { id: string; name: string; }
export interface Snapshot {
  roots: string[];
  projects: Project[];
  activity: Activity[];
  commits: Commit[];
  gitHistory: GitHistory[];
  retentionDays: number;
  historyDays: number;
  preferredEditor: string;
  lastScan: number | null;
  warnings: string[];
}
export const empty: Snapshot = {
  roots: [],
  projects: [],
  activity: [],
  commits: [],
  gitHistory: [],
  retentionDays: 90,
  historyDays: 7,
  preferredEditor: "auto",
  lastScan: null,
  warnings: [],
};
export function relative(timestamp: number | null): string {
  if (!timestamp) return "No edits recorded";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
export function weekDays(offset = 0, reference = new Date()) {
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(end);
    date.setDate(date.getDate() - 6 + i);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}
export function inPeriod(timestamp: number, days: Date[]) {
  const start = days[0].getTime() / 1000;
  const end = new Date(days[6]);
  end.setDate(end.getDate() + 1);
  return timestamp >= start && timestamp < end.getTime() / 1000;
}

export function historyExplanation(project: Project, historyDays: number, retentionDays: number, time = Date.now() / 1000): string {
  if (!project.available) return "Folder unavailable. Reconnect it to refresh Git history.";
  if (!project.lastCommit) return "No commits found on the current branch yet.";
  const date = new Date(project.lastCommit * 1000).toLocaleDateString();
  const effective = Math.min(historyDays, retentionDays);
  if (project.lastCommit < time - effective * 86400) return `Repository connected. Branch tip committed on ${date}, outside the ${effective}-day history window.`;
  return `Repository connected. Branch tip committed on ${date}. History scans up to 10,000 commits; refresh to check for updates.`;
}

export function selectedEditorName(preferred: string, installed: Editor[]): string {
  return (preferred === "auto" ? installed[0] : installed.find(e => e.id === preferred))?.name || "Finder";
}
