# tokly

Server-side TypeScript SDK for sending provider-neutral AI usage events to Tokly. It records token counts and operational metadata only—never prompts, completions, files, or provider credentials.

## Install

```bash
npm install tokly
```

## Usage

```ts
import { createTokly } from "tokly";
import { fromOpenAIResponse } from "tokly/adapters";

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

The `tokly/adapters` entry point includes helpers for:

- Vercel AI SDK usage
- OpenAI Responses usage
- Anthropic Messages usage
- Google Gemini usage metadata

You can also call `capture()` with a provider-neutral usage event directly.

## License

MIT
