type Keychain = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
type Manifest = { version: string; count: number };
// Keep each native keychain value below 2 KB, including non-Latin user metadata.
export function chunks(value: string) {
  const result: string[] = [];
  let current = '', bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    const size = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    if (bytes + size > 1600) { result.push(current); current = ''; bytes = 0; }
    current += character; bytes += size;
  }
  if (current || !result.length) result.push(current);
  return result;
}
export function secureStorage(store: Keychain) {
  const queues = new Map<string, Promise<unknown>>();
  let counter = 0;
  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Preserve atomic writes per record without making sign-in wait for offline snapshots.
    const pending = (queues.get(key) ?? Promise.resolve()).then(operation, operation);
    const settled = pending.catch(() => undefined);
    queues.set(key, settled);
    void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
    return pending;
  }
  async function manifest(key: string): Promise<Manifest | null> {
    const value = await store.getItemAsync(`${key}.manifest`);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (!Number.isInteger(parsed.count) || parsed.count < 1 || parsed.count > 256 || !/^[a-z0-9-]+$/.test(parsed.version)) throw new Error('Saved sign-in is unreadable.');
    return parsed;
  }
  async function removeParts(key: string, value: Manifest | null) {
    if (value) await Promise.all(Array.from({ length: value.count }, (_, i) => store.deleteItemAsync(`${key}.${value.version}.${i}`)));
  }
  return {
    getItem: (key: string) => serial(key, async () => {
      const saved = await manifest(key);
      if (!saved) return null;
      const parts = await Promise.all(Array.from({ length: saved.count }, (_, i) => store.getItemAsync(`${key}.${saved.version}.${i}`)));
      if (parts.some(value => value === null)) return null;
      return parts.join('');
    }),
    setItem: (key: string, value: string) => serial(key, async () => {
      const previous = await manifest(key);
      const parts = chunks(value);
      if (parts.length > 256) throw new Error('Sign-in data is too large to save securely.');
      const next = { version: `${Date.now().toString(36)}-${(++counter).toString(36)}`, count: parts.length };
      try {
        for (let i = 0; i < parts.length; i++) await store.setItemAsync(`${key}.${next.version}.${i}`, parts[i]);
        await store.setItemAsync(`${key}.manifest`, JSON.stringify(next));
      } catch (error) { await removeParts(key, next).catch(() => undefined); throw error; }
      // The new token is committed; old-chunk cleanup cannot fail the login.
      await removeParts(key, previous).catch(() => undefined);
    }),
    removeItem: (key: string) => serial(key, async () => {
      const previous = await manifest(key);
      await store.deleteItemAsync(`${key}.manifest`);
      await removeParts(key, previous).catch(() => undefined);
    }),
  };
}
