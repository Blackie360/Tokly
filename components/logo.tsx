import Link from "next/link";
import styles from "./logo.module.css";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={styles.logo} href="/" aria-label="Tokly home">
      <span className={styles.mark} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {compact ? null : <span>Tokly</span>}
    </Link>
  );
}
