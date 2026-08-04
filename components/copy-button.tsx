"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  return (
    <button className="button secondary" type="button" onClick={copy} aria-live="polite">
      {state === "copied" ? "Copied ✓" : state === "error" ? "Select and copy manually" : label}
    </button>
  );
}
