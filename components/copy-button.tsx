"use client";

import { type CSSProperties, useState } from "react";
import styles from "@/components/copy-button.module.css";

type CopyButtonProps = {
  value: string;
  label: string;
  compact?: boolean;
};

const CONFETTI_PARTICLES = [
  [-36, -30, -95, 0],
  [-25, -42, 120, 35],
  [-13, -29, 210, 65],
  [-4, -46, -170, 20],
  [8, -34, 85, 85],
  [19, -43, 260, 45],
  [31, -27, -60, 10],
  [38, -10, 145, 95],
  [25, 12, -220, 55],
  [9, 18, 190, 105],
  [-15, 15, 75, 30],
  [-32, 7, -135, 75],
] as const;

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
  const [burstKey, setBurstKey] = useState(0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setBurstKey((current) => current + 1);
    } catch {
      setState("error");
    }
  }

  return (
    <button
      aria-label={state === "copied" ? "Copied to clipboard" : state === "error" ? "Copy failed. Try again" : label}
      aria-live="polite"
      className={`button secondary ${styles.celebrationButton} ${compact ? styles.compact : ""}`}
      onClick={copy}
      title={label}
      type="button"
    >
      {burstKey > 0 ? (
        <span
          aria-hidden="true"
          className={styles.confettiBurst}
          data-testid="copy-confetti"
          key={burstKey}
        >
          {CONFETTI_PARTICLES.map(([x, y, rotation, delay]) => (
            <i
              className={styles.confettiPiece}
              key={`${x}-${y}`}
              style={{
                "--confetti-x": `${x}px`,
                "--confetti-y": `${y}px`,
                "--confetti-rotation": `${rotation}deg`,
                "--confetti-delay": `${delay}ms`,
              } as CSSProperties}
            />
          ))}
        </span>
      ) : null}
      <ClipboardIcon copied={state === "copied"} />
      <span>{state === "copied" ? "Copied" : state === "error" ? "Try again" : compact ? "Copy" : label}</span>
    </button>
  );
}
