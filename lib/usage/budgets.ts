export function crossedBudgetThresholds(
  spendUsd: number,
  limitUsd: number,
  thresholds: readonly number[],
) {
  if (!Number.isFinite(spendUsd) || !Number.isFinite(limitUsd) || limitUsd <= 0) return [];
  const utilization = (Math.max(spendUsd, 0) / limitUsd) * 100;
  return [...new Set(thresholds)]
    .filter((threshold) => Number.isFinite(threshold) && threshold > 0 && utilization >= threshold)
    .toSorted((a, b) => a - b);
}
