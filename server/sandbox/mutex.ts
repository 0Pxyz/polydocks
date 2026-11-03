/**
 * Per-key async mutex (#308). Concurrent sandbox ops for the same
 * workspace must not run ensure+upsert at once: two racers both see a
 * missing/expired record, both create, and only one id is stored while
 * the other sandbox leaks until its Modal timeout. The lock serializes
 * the ensure window; the (longer) op itself runs unlocked afterwards.
 */
const chains = new Map<string, Promise<void>>();

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((res) => {
    release = res;
  });
  const tail = prev.then(() => mine);
  chains.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    // Opportunistic cleanup so the map does not grow with workspace ids.
    if (chains.get(key) === tail) chains.delete(key);
  }
}
