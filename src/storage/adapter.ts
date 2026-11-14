import type { AppData } from '../types';
import { migrate } from './migrate';

/**
 * Storage seam (A9). The app only talks to this interface, so a hosted backend
 * (e.g. Supabase with realtime) can replace LocalStorageAdapter without touching views.
 */
export interface StorageAdapter {
  load(): AppData | null;
  save(state: AppData): void;
  /** Called when data changes elsewhere (another tab, another device). Returns an unsubscribe fn. */
  subscribe?(cb: (state: AppData) => void): () => void;
  /** Write any pending debounced save immediately. */
  flush?(): void;
}

export const STORAGE_KEY = 'swamikri-kisan2026-tracker';

export class LocalStorageAdapter implements StorageAdapter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: AppData | null = null;

  constructor(
    private key = STORAGE_KEY,
    private delayMs = 500,
  ) {}

  /** True when the last load() upgraded older stored data to the current schema. */
  migratedOnLoad = false;

  load(): AppData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const data = migrate(parsed);
      this.migratedOnLoad = parsed?.schemaVersion !== data.schemaVersion;
      return data;
    } catch (e) {
      console.error('Could not load saved tracker data', e);
      // Keep the unreadable copy so nothing is silently lost.
      try {
        const raw = localStorage.getItem(this.key);
        if (raw) localStorage.setItem(`${this.key}:corrupt:${Date.now()}`, raw);
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  save(state: AppData): void {
    this.pending = state;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.pending));
      this.pending = null;
    } catch (e) {
      console.error('Could not save tracker data', e);
    }
  }

  subscribe(cb: (state: AppData) => void): () => void {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== this.key || !e.newValue) return;
      try {
        cb(migrate(JSON.parse(e.newValue)));
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
}
