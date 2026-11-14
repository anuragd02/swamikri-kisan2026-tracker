import { useCallback, useState } from 'react';

/** Per-browser UI preference (collapsed rows, toggles). Never used for tracker data. */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((p: T) => T)) => {
      setV((prev) => {
        const val = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(val));
        } catch {
          /* ignore */
        }
        return val;
      });
    },
    [key],
  );
  return [v, set];
}
