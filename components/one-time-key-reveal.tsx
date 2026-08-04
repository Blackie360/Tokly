"use client";

import { useState } from "react";
import styles from "@/components/dashboard/dashboard.module.css";

export function OneTimeKeyReveal({
  value,
}: {
  value: { rawKey: string; prefix: string; projectName: string };
}) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  async function copyKey() {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(value.rawKey);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className={styles.keyReveal} aria-labelledby="one-time-key-heading">
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
