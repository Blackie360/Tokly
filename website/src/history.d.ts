export interface HistoryItem {
  id: string;
  text: string;
  pin: string | null;
}
export interface DemoHistory {
  reset(): void;
  get(id: string | null): HistoryItem | null;
  add(text: string): string | null;
  remove(id: string): void;
  togglePin(id: string): string | null;
  list(query?: string): HistoryItem[];
}
export const PIN_KEYS: string;
export const DEMO_LIMIT: number;
export const SEED: string[];
export function displayText(text: string): string;
export function hexColor(text: string): string | null;
export function segments(text: string, query: string): Array<{text: string; match: boolean}>;
export function createHistory(seed?: string[], limit?: number): DemoHistory;
