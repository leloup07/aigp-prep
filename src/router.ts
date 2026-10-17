// Minimal hash router (works from file:// as well).
import { useSyncExternalStore } from 'react';

const sub = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const hash = useSyncExternalStore(sub, () => window.location.hash);
  const [path, qs] = (hash.replace(/^#/, '') || '/estudio').split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

export const go = (path: string) => { window.location.hash = path; };
