// LRU cache of full-game review results in localStorage.
const KEY = 'xq_analysis_cache_v1';
const MAX_ENTRIES = 10;

interface Entry<T> {
  key: string;
  at: number;
  data: T;
}

function readAll<T>(): Entry<T>[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function fingerprint(startFen: string, ucis: string[]): string {
  const s = startFen.split(' ').slice(0, 2).join(' ') + '|' + ucis.join(' ');
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = (h2 * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h1.toString(36) + h2.toString(36) + ucis.length.toString(36);
}

export function cacheGet<T>(key: string): T | null {
  const all = readAll<T>();
  const hit = all.find((e) => e.key === key);
  if (!hit) return null;
  hit.at = Date.now();
  write(all);
  return hit.data;
}

export function cachePut<T>(key: string, data: T) {
  const all = readAll<T>().filter((e) => e.key !== key);
  all.push({ key, at: Date.now(), data });
  all.sort((a, b) => b.at - a.at);
  write(all.slice(0, MAX_ENTRIES));
}

function write<T>(entries: Entry<T>[]) {
  let list = entries;
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length <= 1) return;
      list = list.slice(0, Math.ceil(list.length / 2)); // drop the oldest half on quota errors
    }
  }
}
