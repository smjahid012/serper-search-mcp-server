// Shared concurrency helper — single source of truth (see BatchSearch).
export const RESEARCH_CONCURRENCY = 4;

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await fn(item, index) as R;
    }
  });

  await Promise.all(workers);
  return results;
}
