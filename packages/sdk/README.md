# tokly-sdk

The server-side TypeScript SDK for Tokly. Instrument AI workloads with exact token counts, cost, latency, model, feature, environment, user, trace, and session attribution—without proxying model traffic or sending prompts, completions, files, or provider credentials.

## Install

```bash
npm install tokly-sdk
```

## Usage

```ts
import { createTokly } from "tokly-sdk";
import { fromOpenAIResponse } from "tokly-sdk/adapters";

const tokly = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
});

tokly.capture(fromOpenAIResponse({
  model: response.model,
  usage: response.usage,
  dimensions: {
    environment: "production",
    feature: "support-copilot",
  },
}));

await tokly.shutdown();
```

`capture()` buffers events and assigns missing IDs and timestamps. `flush()` sends batches of up to 100 events and retries transient failures and rate limits with exponential backoff. Call `shutdown()` during a graceful server shutdown to flush queued events.

Events are sent to `https://tokly.blackielabs.com` by default. Pass `endpoint` when using local development or another Tokly deployment.

The SDK requires Node.js 20 or newer. A Tokly project write key must only be used in server-side code.

## Adapters

The `tokly-sdk/adapters` entry point includes helpers for:

- Vercel AI SDK usage
- OpenAI Responses usage
- Anthropic Messages usage
- Google Gemini usage metadata
- OpenRouter Chat Completions and Responses usage, including provider-reported cost
- Ollama Generate and Chat usage, including token counts and latency

You can also call `capture()` with a provider-neutral usage event directly.

```ts
import { fromOllamaResponse, fromOpenRouterResponse } from "tokly-sdk/adapters";

tokly.capture(fromOpenRouterResponse({
  model: response.model,
  usage: response.usage,
  dimensions: { environment: "production", feature: "assistant" },
}));

tokly.capture(fromOllamaResponse({
  model: ollamaResponse.model,
  prompt_eval_count: ollamaResponse.prompt_eval_count,
  eval_count: ollamaResponse.eval_count,
  total_duration: ollamaResponse.total_duration,
  dimensions: { environment: "local", feature: "assistant" },
}));
```

OpenRouter cost is taken from its response. Ollama events intentionally omit `costUsd`; Tokly records local token usage and latency without inventing a compute price.

## Optional machine connector

The SDK does not modify or monitor a developer workstation. To connect supported local AI tools, install the separate `tokly-cli` package:

```bash
npm install -g tokly-cli
tokly init
```

## Uninstall

```bash
npm uninstall tokly-sdk
```

## License

MIT
