"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
let currentTheme: Theme = "light";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const saved = localStorage.getItem("tokly-theme");
  const initial: Theme = saved === "dark" || saved === "light"
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = initial;
  if (initial !== currentTheme) {
    currentTheme = initial;
    queueMicrotask(() => listeners.forEach((notify) => notify()));
  }
  return () => listeners.delete(listener);
}

function getTheme() {
  return currentTheme;
}

function setExternalTheme(theme: Theme) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("tokly-theme", theme);
  listeners.forEach((notify) => notify());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setExternalTheme(next);
  }

  return (
    <button className="button secondary" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
