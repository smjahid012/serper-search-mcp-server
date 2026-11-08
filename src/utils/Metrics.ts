/**
 * In-memory metrics — SMLabs AI
 *
 * Process-lifetime counters exposed on /health. No external deps, no
 * cardinality explosion (fixed key set, no labels). Read via snapshot();
 * mutate only through increment(). resetMetrics() exists for tests.
 */

export type MetricName = 'cache_hits' | 'cache_misses' | 'failover_events' | 'provider_errors' | 'searches';

const counters: Record<MetricName, number> = {
  cache_hits: 0,
  cache_misses: 0,
  failover_events: 0,
  provider_errors: 0,
  searches: 0,
};

export function increment(name: MetricName, by = 1): void {
  counters[name] += by;
}

/** Immutable point-in-time copy — safe to JSON.stringify into /health. */
export function snapshot(): Record<MetricName, number> {
  return { ...counters };
}

export function resetMetrics(): void {
  for (const key of Object.keys(counters) as MetricName[]) counters[key] = 0;
}