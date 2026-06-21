/**
 * Run items with controlled concurrency limit
 * Prevents overwhelming rate limits by queuing requests
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await worker(items[current]!, current);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);
  return results as R[];
}
