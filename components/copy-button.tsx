"use client";

import { useState } from "react";
import styles from "@/components/copy-button.module.css";

type CopyButtonProps = {
  value: string;
  label: string;
  compact?: boolean;
};

function ClipboardIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 20 20">
        <path d="m4.5 10.5 3.25 3.25L15.5 6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 20 20">
      <rect height="11" rx="1.5" width="9" x="7" y="6" />
      <path d="M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H7" />
    </svg>
  );
}

export function CopyButton({ value, label, compact = false }: CopyButtonProps) {
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
    <button
      aria-label={state === "copied" ? "Copied to clipboard" : state === "error" ? "Copy failed. Try again" : label}
      aria-live="polite"
      className={`button secondary ${compact ? styles.compact : ""}`}
      onClick={copy}
      title={label}
      type="button"
    >
      <ClipboardIcon copied={state === "copied"} />
      <span>{state === "copied" ? "Copied" : state === "error" ? "Try again" : compact ? "Copy" : label}</span>
    </button>
  );
}
