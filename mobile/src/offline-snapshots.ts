type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
type Snapshot = { key: string; at: number; data: unknown };
const lifetime = 24 * 60 * 60 * 1000;

// Small encrypted read-only snapshots. Checkout requests have separate durable keys.
export function offlineSnapshots(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation, operation); queue = next.catch(() => undefined); return next;
  }
  const storageKey = (userId: string) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) throw new Error('Invalid offline account.');
    return `tenh-offline-v1-${userId}`;
  };
  async function rows(userId: string): Promise<Snapshot[]> {
    const raw = await storage.getItem(storageKey(userId));
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value.filter(row => typeof row.key === 'string' && Number.isFinite(row.at) && row.at <= Date.now() && Date.now() - row.at < lifetime) : [];
    } catch { return []; }
  }
  return {
    read: (userId: string, key: string) => serial(async () => (await rows(userId)).find(row => row.key === key)),
    remove: (userId: string, key: string) => serial(async () => storage.setItem(storageKey(userId), JSON.stringify((await rows(userId)).filter(row => row.key !== key)))),
    save: (userId: string, key: string, data: unknown) => serial(async () => {
      const encoded = JSON.stringify(data);
      if (encoded.length > 24000) return; // Large reports remain online; never truncate business totals.
      const previous = await rows(userId);
      const existing = previous.find(row => row.key === key);
      if (existing && Date.now() - existing.at < 300000 && JSON.stringify(existing.data) === encoded) return;
      let saved = previous.filter(row => row.key !== key);
      saved.push({ key, data, at: Date.now() });
      saved = saved.slice(-8);
      while (JSON.stringify(saved).length > 80000) saved.shift();
      await storage.setItem(storageKey(userId), JSON.stringify(saved));
    }),
    clear: (userId: string, keepWorkspace = false) => serial(async () => {
      if (keepWorkspace) await storage.setItem(storageKey(userId), JSON.stringify((await rows(userId)).filter(row => row.key === 'workspace')));
      else await storage.removeItem(storageKey(userId));
    }),
  };
}

export function canSaveOffline(path: string) {
  const [feature, query] = path.split('?');
  if (!['stock', 'orders', 'purchases', 'transfers', 'reports'].includes(feature)) return false;
  const params = new URLSearchParams(query);
  return !params.get('search') && (!params.get('page') || params.get('page') === '1');
}
