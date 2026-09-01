"use client";

import { type CSSProperties, useState } from "react";
import styles from "@/components/dashboard/dashboard.module.css";

const CONFETTI_PARTICLES = [
  [-112, -50, -95, 0],
  [-94, -86, 120, 45],
  [-72, -44, 210, 95],
  [-52, -102, -170, 20],
  [-30, -62, 85, 120],
  [-12, -114, 260, 70],
  [10, -74, -60, 10],
  [28, -108, 145, 105],
  [48, -58, -220, 50],
  [66, -96, 190, 130],
  [84, -48, 75, 30],
  [104, -82, -135, 85],
  [-86, -22, 160, 145],
  [-38, -32, -105, 165],
  [42, -26, 235, 150],
  [92, -18, -250, 175],
] as const;

export function OneTimeKeyReveal({
  value,
}: {
  value: { rawKey: string; prefix: string; projectName: string };
}) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [celebrate, setCelebrate] = useState(false);

  async function copyKey() {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(value.rawKey);
      setCopyState("copied");
      setCelebrate(true);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className={styles.keyReveal} aria-labelledby="one-time-key-heading">
      {celebrate ? (
        <span className={styles.confettiBurst} data-testid="key-copy-confetti" aria-hidden="true">
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
      <span className={styles.keyRevealLabel}>1 / Save key · one-time reveal</span>
      <strong id="one-time-key-heading">Save the {value.projectName} write key</strong>
      <p>This is the only time Tokly will show the full key. Copy it now and store it in an environment variable.</p>
      <div className={styles.keyValue}>
        <code aria-label={`New ${value.projectName} write key`}>{value.rawKey}</code>
        <button className="button" type="button" onClick={copyKey} disabled={copyState === "copying"}>
          {copyState === "copying" ? "Copying…" : copyState === "copied" ? "Copy again" : copyState === "error" ? "Retry copy" : "Copy key"}
        </button>
      </div>
      {copyState === "copied" ? (
        <p className={styles.copySuccess} role="status">Copied ✓ You can copy it again while this page is open.</p>
      ) : null}
      {copyState === "error" ? <p className="error-copy" role="alert">Copy failed. Select the key and copy it manually.</p> : null}
      <p className="muted">The saved key works anywhere you use it and remains valid until revoked. For another device or environment, create a separate key so it can be revoked independently. Tokly will keep only this masked prefix: <span className="mono">{value.prefix}••••</span>.</p>
    </section>
  );
}
