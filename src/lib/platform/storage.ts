/**
 * Safe, typed platform storage abstraction with in-memory fallback.
 * Strictly encapsulates all localStorage interactions.
 */

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

const memoryFallback = new MemoryStorage();

function getNativeStorage(): Storage | MemoryStorage {
  if (typeof window === "undefined" || !window.localStorage) {
    return memoryFallback;
  }
  try {
    const testKey = "__polydocks_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return memoryFallback;
  }
}

export const platformStorage = {
  /**
   * Retrieves and deserializes a JSON value from storage.
   */
  getItem<T>(key: string, defaultValue?: T): T | null {
    try {
      const storage = getNativeStorage();
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) {
        return defaultValue ?? null;
      }
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue ?? null;
    }
  },

  /**
   * Serializes and stores a JSON value in storage.
   */
  setItem<T>(key: string, value: T): boolean {
    try {
      const storage = getNativeStorage();
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Removes an item from storage.
   */
  removeItem(key: string): boolean {
    try {
      const storage = getNativeStorage();
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Clears all storage keys or keys with a matching prefix.
   */
  clear(prefix?: string): boolean {
    try {
      const storage = getNativeStorage();
      if (!prefix) {
        storage.clear();
        return true;
      }

      const allKeys = this.getAllKeys(prefix);
      for (const k of allKeys) {
        storage.removeItem(k);
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Returns all keys currently stored, optionally filtered by prefix.
   */
  getAllKeys(prefix?: string): string[] {
    try {
      const storage = getNativeStorage();
      const keys: string[] = [];

      if (storage instanceof MemoryStorage) {
        const memoryKeys = storage.keys();
        return prefix ? memoryKeys.filter((k) => k.startsWith(prefix)) : memoryKeys;
      }

      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (!prefix || k.startsWith(prefix))) {
          keys.push(k);
        }
      }
      return keys;
    } catch {
      return [];
    }
  },
};
