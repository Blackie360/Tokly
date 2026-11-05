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
}
export interface Activity {
  id: number;
  projectId: string;
  kind: string;
  label: string;
  timestamp: number;
}
export interface Commit {
  projectId: string;
  sha: string;
  label: string;
  timestamp: number;
}
export interface Snapshot {
  roots: string[];
  projects: Project[];
  activity: Activity[];
  commits: Commit[];
  retentionDays: number;
  lastScan: number | null;
  warnings: string[];
}
export const empty: Snapshot = {
  roots: [],
  projects: [],
  activity: [],
  commits: [],
  retentionDays: 90,
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
