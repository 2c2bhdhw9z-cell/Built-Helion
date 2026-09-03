/**
 * Key-value I/O for Helion. Browser uses localStorage. Native shells
 * (Capacitor Preferences, Tauri store) implement KvStore later via setKvStore
 * or cachedKv — engine and UI must not call localStorage directly.
 */

export type KvStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

/** Async native stores (Capacitor Preferences, Tauri) wrap through cachedKv. */
export type AsyncKvStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

function memoryKv(): KvStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
  };
}

function browserKv(): KvStore {
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* quota / private mode */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Sync facade over an async native store. Seed from a one-shot hydrate at boot
 * (Preferences.get / Tauri store load). Writes update the cache immediately
 * and flush to the backend; they do not invent keys.
 */
export function cachedKv(backend: AsyncKvStore, seed: Record<string, string> = {}): KvStore {
  const map = new Map(Object.entries(seed));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
      void backend.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
      void backend.remove(key);
    },
  };
}

let current: KvStore | null = null;

export function kv(): KvStore {
  if (current) return current;
  current = typeof localStorage !== "undefined" ? browserKv() : memoryKv();
  return current;
}

export function setKvStore(next: KvStore): void {
  current = next;
}

export function newMemoryKv(): KvStore {
  return memoryKv();
}
