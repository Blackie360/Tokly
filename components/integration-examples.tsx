"use client";

import { type KeyboardEvent, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import styles from "@/components/integration-examples.module.css";

const EXAMPLES = [
  {
    id: "openai",
    label: "OpenAI",
    description: "Pass the model and usage from an OpenAI Responses result.",
    code: `import { createTokly } from "tokly-sdk";
import { fromOpenAIResponse } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromOpenAIResponse({
  model: response.model,
  usage: response.usage,
  dimensions: {
    environment: "production",
    feature: "assistant",
  },
}));

await tokly.flush();`,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Map token and prompt-cache usage from an Anthropic Messages result.",
    code: `import { createTokly } from "tokly-sdk";
import { fromAnthropicResponse } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromAnthropicResponse({
  model: response.model,
  usage: response.usage,
  dimensions: {
    environment: "production",
    feature: "assistant",
  },
}));

await tokly.flush();`,
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Capture Google Gemini usage metadata after generating content.",
    code: `import { createTokly } from "tokly-sdk";
import { fromGeminiResponse } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromGeminiResponse({
  model: "gemini-3.5-flash",
  usageMetadata: response.usageMetadata,
  dimensions: {
    environment: "production",
    feature: "assistant",
  },
}));

await tokly.flush();`,
  },
  {
    id: "vercel-ai",
    label: "Vercel AI",
    description: "Use the provider-neutral usage returned by the Vercel AI SDK.",
    code: `import { createTokly } from "tokly-sdk";
import { fromAiSdkUsage } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromAiSdkUsage({
  provider: "openai",
  model: "gpt-5.5",
  usage: result.usage,
  dimensions: {
    environment: "production",
    feature: "assistant",
  },
}));

await tokly.flush();`,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Keep OpenRouter-reported cost, cache, and reasoning usage intact.",
    code: `import { createTokly } from "tokly-sdk";
import { fromOpenRouterResponse } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromOpenRouterResponse({
  model: response.model,
  usage: response.usage,
  dimensions: {
    environment: "production",
    feature: "assistant",
  },
}));

await tokly.flush();`,
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Record local token counts and latency without inventing a dollar cost.",
    code: `import { createTokly } from "tokly-sdk";
import { fromOllamaResponse } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromOllamaResponse({
  model: response.model,
  prompt_eval_count: response.prompt_eval_count,
  eval_count: response.eval_count,
  total_duration: response.total_duration,
  dimensions: {
    environment: "local",
    feature: "assistant",
  },
}));

await tokly.flush();`,
  },
] as const;

export function IntegrationExamples() {
  const [activeId, setActiveId] = useState<(typeof EXAMPLES)[number]["id"]>("openai");
  const activeExample = EXAMPLES.find((example) => example.id === activeId) ?? EXAMPLES[0];

  function selectTab(index: number) {
    const next = EXAMPLES[index];
    setActiveId(next.id);
    requestAnimationFrame(() => document.getElementById(`integration-tab-${next.id}`)?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % EXAMPLES.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + EXAMPLES.length) % EXAMPLES.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = EXAMPLES.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      selectTab(nextIndex);
    }
  }

  return (
    <div className={styles.examples}>
      <div className={styles.tabList} role="tablist" aria-label="SDK provider examples">
        {EXAMPLES.map((example, index) => (
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
        <pre className={styles.codeBlock} data-testid="integration-example"><code>{activeExample.code}</code></pre>
      </section>
      <p className={styles.note}>Run Tokly only on your server. Keep <span className="mono">TOKLY_API_KEY</span> in an environment variable and flush before a serverless request ends.</p>
    </div>
  );
}
