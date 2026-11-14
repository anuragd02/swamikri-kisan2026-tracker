import { useSyncExternalStore } from 'react';

export type View = 'dashboard' | 'tasks' | 'board' | 'timeline' | 'mine' | 'expo' | 'settings';

export const VIEWS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'board', label: 'Board' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'mine', label: 'My tasks' },
  { id: 'expo', label: 'Expo mode' },
  { id: 'settings', label: 'Settings' },
];

export interface Route {
  view: View;
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const view = (VIEWS.find((v) => v.id === path)?.id ?? 'dashboard') as View;
  return { view, params: new URLSearchParams(query) };
}

let current = parse(window.location.hash);
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse(window.location.hash);
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function href(view: View, params?: URLSearchParams | Record<string, string>): string {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const q = p.toString();
  return `#/${view}${q ? `?${q}` : ''}`;
}

export function navigate(view: View, params?: URLSearchParams | Record<string, string>, replace = false) {
  const next = href(view, params);
  if (replace) {
    history.replaceState(null, '', next);
    current = parse(next);
    listeners.forEach((l) => l());
  } else {
    window.location.hash = next;
  }
}
