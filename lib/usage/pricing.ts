import type { ModelPrice } from "@/lib/db/schema";
import type { UsageEventInput } from "./schema";

const SCALE_DIGITS = 10;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
const TOKENS_PER_MILLION = 1_000_000n;

function parseScaled(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = `${fraction}${"0".repeat(SCALE_DIGITS)}`.slice(0, SCALE_DIGITS);
  return BigInt(whole) * SCALE + BigInt(normalizedFraction || "0");
}

function formatScaled(value: bigint): string {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(SCALE_DIGITS, "0");
  return `${whole}.${fraction}`;
}

function componentCost(tokens: number, ratePerMillion: string) {
  return (BigInt(tokens) * parseScaled(ratePerMillion)) / TOKENS_PER_MILLION;
}

export function findPrice(
  event: UsageEventInput,
  catalog: readonly ModelPrice[],
): ModelPrice | undefined {
  const occurredAt = new Date(event.timestamp).getTime();
  return catalog
    .filter(
      (price) =>
        price.provider === event.provider &&
        price.model === event.model &&
        price.effectiveFrom.getTime() <= occurredAt &&
        (!price.effectiveTo || price.effectiveTo.getTime() > occurredAt),
    )
    .toSorted((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
}

export function calculateEventCost(
  event: UsageEventInput,
  catalog: readonly ModelPrice[],
): { costUsd: string | null; source: "reported" | "calculated" | "unpriced" } {
  if (event.costUsd !== undefined) {
    return { costUsd: formatScaled(parseScaled(event.costUsd)), source: "reported" };
  }

  const price = findPrice(event, catalog);
  if (!price) return { costUsd: null, source: "unpriced" };

  const inputTokens = event.usage.inputTokens ?? 0;
  const cacheReadTokens = event.usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = event.usage.cacheWriteTokens ?? 0;
  const uncachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);

  const scaledCost =
    componentCost(uncachedInputTokens, price.inputPerMillionUsd) +
    componentCost(event.usage.outputTokens ?? 0, price.outputPerMillionUsd) +
    componentCost(cacheReadTokens, price.cacheReadPerMillionUsd) +
    componentCost(cacheWriteTokens, price.cacheWritePerMillionUsd);

  return { costUsd: formatScaled(scaledCost), source: "calculated" };
}

export const pricingInternals = { parseScaled, formatScaled };
