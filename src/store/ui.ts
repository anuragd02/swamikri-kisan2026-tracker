import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: { label: string; run: () => void };
  timeoutMs: number;
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  tone?: 'primary' | 'danger' | 'default';
}

export interface ChoiceRequest {
  title: string;
  body?: string;
  options: ChoiceOption<string>[];
  /** If set, user must type this text to enable the danger option. */
  typeToConfirm?: string;
  resolve: (v: string | null) => void;
}

export interface PickerRequest {
  title: string;
  /** Ids that cannot be chosen (e.g. the task itself and its descendants). */
  excludeIds: Set<string>;
  allowRoot?: boolean;
  multi?: false;
  resolve: (v: string | null | undefined) => void; // undefined = cancelled, null = root
}

interface UIState {
  drawerId: string | null;
  quickAddOpen: boolean;
  quickAddPrefill: string;
  toasts: Toast[];
  choice: ChoiceRequest | null;
  picker: PickerRequest | null;
  shortcutsOpen: boolean;
  openDrawer: (id: string | null) => void;
  openQuickAdd: (prefill?: string) => void;
  closeQuickAdd: () => void;
  toast: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => number;
  dismissToast: (id: number) => void;
  setShortcutsOpen: (v: boolean) => void;
}

let toastSeq = 1;

export const useUI = create<UIState>((set) => ({
  drawerId: null,
  quickAddOpen: false,
  quickAddPrefill: '',
  toasts: [],
  choice: null,
  picker: null,
  shortcutsOpen: false,
  openDrawer: (id) => set({ drawerId: id }),
  openQuickAdd: (prefill = '') => set({ quickAddOpen: true, quickAddPrefill: prefill }),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddPrefill: '' }),
  toast: (message, opts = {}) => {
    const id = toastSeq++;
    const t: Toast = {
      id,
      message,
      kind: opts.kind ?? 'info',
      action: opts.action,
      timeoutMs: opts.timeoutMs ?? (opts.action ? 10_000 : opts.kind === 'error' ? 6000 : 3500),
    };
    set((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
}));

export function askChoice<T extends string>(req: Omit<ChoiceRequest, 'resolve' | 'options'> & { options: ChoiceOption<T>[] }): Promise<T | null> {
  return new Promise((resolve) => {
    useUI.setState({
      choice: {
        ...req,
        options: req.options,
        resolve: (v) => {
          useUI.setState({ choice: null });
          resolve(v as T | null);
        },
      },
    });
  });
}

/** Opens the searchable task picker. Resolves to a task id, null (= make main task), or undefined (cancel). */
export function pickTask(req: Omit<PickerRequest, 'resolve'>): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    useUI.setState({
      picker: {
        ...req,
        resolve: (v) => {
          useUI.setState({ picker: null });
          resolve(v);
        },
      },
    });
  });
}

export const toast = (...args: Parameters<UIState['toast']>) => useUI.getState().toast(...args);
