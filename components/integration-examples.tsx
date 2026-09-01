import "server-only";

import { codeToHtml } from "shiki";
import {
  IntegrationExamplesClient,
  type HighlightedIntegrationExample,
} from "@/components/integration-examples-client";

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
] as const satisfies readonly Omit<HighlightedIntegrationExample, "highlightedCode">[];

export async function IntegrationExamples() {
  const highlightedExamples = await Promise.all(
    EXAMPLES.map(async (example) => ({
      ...example,
      highlightedCode: await codeToHtml(example.code, {
        lang: "typescript",
        theme: "dark-plus",
      }),
    })),
  );

  return <IntegrationExamplesClient examples={highlightedExamples} />;
}
