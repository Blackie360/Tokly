import { randomUUID } from "node:crypto";
import type { ToklyOptions, UsageEvent } from "./types.js";

export type { ToklyOptions, UsageEvent, UsageOperation, UsageProvider } from "./types.js";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
type QueuedEvent = UsageEvent & Required<Pick<UsageEvent, "id" | "timestamp">>;
class NonRetryableError extends Error {}

export class Tokly {
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #flushAt: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof globalThis.fetch;
  #queue: QueuedEvent[] = [];
  #timer: ReturnType<typeof setInterval>;
  #inflight: Promise<void> | null = null;

  constructor(options: ToklyOptions) {
    if (typeof window !== "undefined") {
      throw new Error("tokly-sdk is server-only; never expose a project write key in a browser.");
    }
    if (!/^tok_(live|test)_/.test(options.apiKey)) throw new Error("A Tokly project write key is required.");
    if (options.endpoint && !/^https?:\/\//.test(options.endpoint)) throw new Error("A valid Tokly endpoint URL is required.");
    this.#apiKey = options.apiKey;
    this.#endpoint = (options.endpoint ?? "https://tokly.blackielabs.com").replace(/\/$/, "");
    this.#flushAt = Math.min(100, Math.max(1, options.flushAt ?? 20));
    this.#maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timer = setInterval(() => void this.flush(), options.flushIntervalMs ?? 5_000);
    this.#timer.unref?.();
  }

  capture(event: UsageEvent) {
    const normalized = {
      ...event,
      id: event.id ?? randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      status: event.status ?? "success",
    };
    this.#queue.push(normalized);
    if (this.#queue.length >= this.#flushAt) void this.flush();
    return normalized.id;
  }

  async flush() {
    if (this.#inflight) return this.#inflight;
    if (this.#queue.length === 0) return;
    const batch = this.#queue.splice(0, 100);
    this.#inflight = this.#send(batch).catch((error) => {
      this.#queue.unshift(...batch);
      throw error;
    }).finally(() => {
      this.#inflight = null;
      if (this.#queue.length >= this.#flushAt) void this.flush();
    });
    return this.#inflight;
  }

  async #send(events: UsageEvent[]) {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      try {
        const response = await this.#fetch(`${this.#endpoint}/api/v1/events`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.#apiKey}`,
            "content-type": "application/json",
            "user-agent": "tokly-sdk/0.1.1",
          },
          body: JSON.stringify({ events }),
        });
        if (response.ok) return;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new NonRetryableError(`Tokly rejected the batch with HTTP ${response.status}.`);
        }
        const retryAfter = Number(response.headers.get("retry-after") ?? 0) * 1000;
        lastError = new Error(`Tokly ingestion returned HTTP ${response.status}.`);
        if (attempt < this.#maxRetries) {
          await sleep(retryAfter || Math.min(8_000, 250 * 2 ** attempt));
        }
      } catch (error) {
        if (error instanceof NonRetryableError) throw error;
        lastError = error instanceof Error ? error : new Error("Tokly ingestion failed.");
        if (attempt < this.#maxRetries) await sleep(Math.min(8_000, 250 * 2 ** attempt));
      }
    }
    throw lastError ?? new Error("Tokly ingestion failed.");
  }

  async shutdown() {
    clearInterval(this.#timer);
    await this.flush();
  }
}

export function createTokly(options: ToklyOptions) {
  return new Tokly(options);
}
