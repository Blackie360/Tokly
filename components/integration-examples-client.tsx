"use client";

import { type KeyboardEvent, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import styles from "@/components/integration-examples.module.css";

export type HighlightedIntegrationExample = {
  id: string;
  label: string;
  description: string;
  code: string;
  highlightedCode: string;
};

export function IntegrationExamplesClient({
  examples,
}: {
  examples: readonly HighlightedIntegrationExample[];
}) {
  const [activeId, setActiveId] = useState(examples[0]?.id ?? "");
  const activeExample = examples.find((example) => example.id === activeId) ?? examples[0];

  if (!activeExample) return null;

  function selectTab(index: number) {
    const next = examples[index];
    if (!next) return;
    setActiveId(next.id);
    requestAnimationFrame(() => document.getElementById(`integration-tab-${next.id}`)?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % examples.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + examples.length) % examples.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = examples.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      selectTab(nextIndex);
    }
  }

  return (
    <div className={styles.examples}>
      <div className={styles.tabList} role="tablist" aria-label="SDK provider examples">
        {examples.map((example, index) => (
          <button
            aria-controls={`integration-panel-${example.id}`}
            aria-selected={example.id === activeId}
            className={styles.tab}
            id={`integration-tab-${example.id}`}
            key={example.id}
            onClick={() => setActiveId(example.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            tabIndex={example.id === activeId ? 0 : -1}
            type="button"
          >
            {example.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={`integration-tab-${activeExample.id}`}
        className={styles.panel}
        id={`integration-panel-${activeExample.id}`}
        role="tabpanel"
      >
        <div className={styles.panelHeader}>
          <p>{activeExample.description}</p>
          <CopyButton key={activeExample.id} value={activeExample.code} label={`Copy ${activeExample.label} example`} />
        </div>
        <div
          className={styles.codeBlock}
          data-testid="integration-example"
          dangerouslySetInnerHTML={{ __html: activeExample.highlightedCode }}
        />
      </section>
      <p className={styles.note}>Run Tokly only on your server. Keep <span className="mono">TOKLY_API_KEY</span> in an environment variable and flush before a serverless request ends.</p>
    </div>
  );
}
