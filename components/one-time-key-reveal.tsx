"use client";

import { useEffect } from "react";
import { consumeKeyRevealAction } from "@/app/actions";
import styles from "@/components/dashboard/dashboard.module.css";

export function OneTimeKeyReveal({
  value,
}: {
  value: { rawKey: string; prefix: string; projectName: string };
}) {
  useEffect(() => {
    void consumeKeyRevealAction();
  }, []);

  return (
    <section className={styles.keyReveal} role="status">
      <strong>Copy the {value.projectName} key now—it will not be shown again.</strong>
      <div className={styles.keyValue}><code>{value.rawKey}</code></div>
      <p className="muted">Only the prefix <span className="mono">{value.prefix}</span> and SHA-256 digest are retained.</p>
    </section>
  );
}
