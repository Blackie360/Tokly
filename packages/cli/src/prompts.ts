import { emitKeypressEvents, type Key } from "node:readline";
import { stdin, stdout } from "node:process";

export type MultiSelectState = { cursor: number; selected: Set<number> };
export type MultiSelectAction = "up" | "down" | "toggle";

export function updateMultiSelect(state: MultiSelectState, action: MultiSelectAction, itemCount: number): MultiSelectState {
  if (itemCount <= 0) return { cursor: 0, selected: new Set() };
  if (action === "up") return { cursor: (state.cursor - 1 + itemCount) % itemCount, selected: new Set(state.selected) };
  if (action === "down") return { cursor: (state.cursor + 1) % itemCount, selected: new Set(state.selected) };
  const selected = new Set(state.selected);
  if (selected.has(state.cursor)) selected.delete(state.cursor); else selected.add(state.cursor);
  return { cursor: state.cursor, selected };
}

export function acceptsConfirmation(answer: string, defaultYes = false) {
  const value = answer.trim();
  if (!value) return defaultYes;
  return /^y(es)?$/i.test(value);
}

export async function selectTools<T extends { label: string }>(items: readonly T[]): Promise<T[]> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Interactive tool selection requires a terminal.");
  }

  emitKeypressEvents(stdin);
  const wasRaw = stdin.isRaw;
  const wasPaused = stdin.isPaused();
  let state: MultiSelectState = { cursor: 0, selected: new Set(items.map((_, index) => index)) };
  const lineCount = items.length + 1;
  let rendered = false;

  const render = () => {
    if (rendered) stdout.write(`\u001B[${lineCount}A`);
    const lines = [
      "Select tools (↑/↓ move, Space toggle, Enter confirm)",
      ...items.map((item, index) => `${index === state.cursor ? "❯" : " "} ${state.selected.has(index) ? "◉" : "○"} ${item.label}`),
    ];
    for (const line of lines) stdout.write(`\u001B[2K\r${line}\n`);
    rendered = true;
  };

  stdin.setRawMode(true);
  stdin.resume();
  render();

  return new Promise<T[]>((resolve, reject) => {
    const cleanup = () => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(Boolean(wasRaw));
      if (wasPaused) stdin.pause();
    };
    const onKeypress = (_input: string, key: Key) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Setup cancelled."));
        return;
      }
      if (key.name === "up" || key.name === "k") state = updateMultiSelect(state, "up", items.length);
      else if (key.name === "down" || key.name === "j") state = updateMultiSelect(state, "down", items.length);
      else if (key.name === "space") state = updateMultiSelect(state, "toggle", items.length);
      else if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(items.filter((_, index) => state.selected.has(index)));
        return;
      } else return;
      render();
    };
    stdin.on("keypress", onKeypress);
  });
}
