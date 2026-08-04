# tokly-sdk

Server-side TypeScript SDK for sending provider-neutral AI usage events to Tokly. It records token counts and operational metadata only—never prompts, completions, files, or provider credentials.

## Install

```bash
npm install tokly-sdk
```

To connect developer AI tools on a workstation:

```bash
npm install -g tokly-sdk
tokly init
```

The wizard detects Cursor, Codex, Claude Code, Gemini CLI, and Ollama, explains monitoring fidelity, and lets you choose tools with the arrow keys, Space, and Enter. It previews every file and login-service change before applying anything. It then opens Tokly in your browser: sign in, choose the Tokly app to connect, and the terminal continues automatically. You never copy a project key or machine credential. Machine credentials are stored only in macOS Keychain, Windows Credential Manager, Linux Secret Service, or an initialized Linux `pass` store; setup stops if no supported encrypted credential store is available.

Use `tokly status`, `tokly tools`, `tokly start`, `tokly stop`, or `tokly disconnect` to manage the connector. Claude Code and Gemini CLI report exact token metrics. Cursor, Codex, and Ollama report lifecycle activity only and never invent token or cost values.

## Uninstall

If you configured the machine connector, disconnect first so Tokly removes its collector service
and owned tool configuration. Then uninstall the global package:

```bash
tokly disconnect
npm uninstall -g tokly-sdk
```

If you installed only the server SDK in a project, remove that dependency with:

```bash
npm uninstall tokly-sdk
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

## License

MIT
