// In-memory app state mirrored to IndexedDB. Everything stays in the browser.
import { openDB, type IDBPDatabase } from 'idb';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, EMPTY, type AppData } from './model';

const DB_NAME = 'aigp-prep';
const KEYS = Object.keys(EMPTY) as (keyof AppData)[];

let db: IDBPDatabase | null = null;
let state: AppData = EMPTY;
let ready = false;
let persistent = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export async function initStore(): Promise<void> {
  try {
    db = await openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('kv');
      },
    });
    const loaded: Partial<AppData> = {};
    for (const k of KEYS) {
      const v = await db.get('kv', k);
      if (v !== undefined) (loaded as any)[k] = v;
    }
    state = { ...EMPTY, ...loaded, settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) } };
    persistent = true;
  } catch (e) {
    console.warn('IndexedDB no disponible; los datos no se guardarán', e);
  }
  ready = true;
  emit();
}

export function getState() {
  return state;
}

/** Replace one slice of the state and persist it. */
export function setSlice<K extends keyof AppData>(key: K, value: AppData[K] | ((prev: AppData[K]) => AppData[K])) {
  const next = typeof value === 'function' ? (value as (p: AppData[K]) => AppData[K])(state[key]) : value;
  state = { ...state, [key]: next };
  emit();
  db?.put('kv', next, key).catch((e) => console.error('No se pudo guardar', key, e));
}

export function useApp<T>(sel: (s: AppData) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => sel(state),
  );
}

export const isReady = () => ready;
export const isPersistent = () => persistent;

// ---------------------------------------------------------------- backup

export function exportJson(): string {
  return JSON.stringify({ app: 'aigp-prep', exportedAt: new Date().toISOString(), data: state }, null, 1);
}

export function importJson(text: string) {
  const parsed = JSON.parse(text);
  if (parsed?.app !== 'aigp-prep' || typeof parsed.data !== 'object') throw new Error('El archivo no es una copia de seguridad de AIGP Prep');
  for (const k of KEYS) {
    const v = parsed.data[k] ?? EMPTY[k];
    setSlice(k, k === 'settings' ? { ...DEFAULT_SETTINGS, ...v } : v);
  }
}

export function resetAll() {
  for (const k of KEYS) setSlice(k, EMPTY[k]);
}
