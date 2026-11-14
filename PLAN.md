# KISAN 2026 Tracker: build plan

## Decisions from kickoff questions

- Single editor at a time → **local-first** (`LocalStorageAdapter`), JSON export/import for sharing. Adapter seam kept for a hosted backend later.
- Hosting: **local only** (`npm run dev` / `npm run preview`). The static `dist/` build also works on any static host.
- Team members: empty (added in Settings).
- Setup (move-in) date: **2026-12-07** (organiser confirmed).

## Stack (kept minimal)

| Need | Choice | Why |
|---|---|---|
| Build | Vite 5 + React 18 + TypeScript (strict) | spec default |
| Styling | Tailwind CSS 3 | spec default, print variants |
| State | Zustand | tiny, no boilerplate |
| Drag and drop | @dnd-kit/core | touch + pointer + keyboard sensors |
| Icons | lucide-react | consistent line icons, no emoji UI |
| Ids | nanoid | new task ids |
| Charts | small custom SVG | one burndown chart does not justify Recharts |
| Dates | own `lib/dates.ts` (pure string/UTC arithmetic) | all dates are `yyyy-mm-dd` local dates; avoiding `Date` timezone parsing removes off-by-one bugs. "Today" is computed in Asia/Kolkata. |
| Tests | Vitest | spec default |

## Folder structure

```
docs/KISAN2026_TRACKER_SPEC.md   source of truth (copy)
scripts/gen-seed.mjs             parses spec Part B -> src/data/seed.ts (deterministic)
public/brand/                    logo + favicon mark
src/
  types.ts                       Task, Workstream, Settings, Snapshot, AppData
  lib/
    dates.ts                     today (IST), addDays, diffDays, formatting
    tree.ts                      pure tree ops (add/update/delete/move/indent/outdent/reorder, cycle checks)
    progress.ts                  roll-up, derived status, overall/P0 %, overdue, due-soon, gates, spend
    quickadd.ts                  token parser for quick-add
    filters.ts                   filter model <-> URL query, matching with greyed ancestors
    csv.ts                       CSV export with path column
    undo.ts                      task-level diff/patch so undo never clobbers unrelated edits
  data/seed.ts                   generated seed (tasks, workstreams, settings)
  storage/                       StorageAdapter interface, LocalStorageAdapter, migrate()
  store/                         Zustand data store (wraps tree ops) + UI store (drawer, toasts, dialogs)
  components/                    Header, Nav, QuickAdd, TaskDrawer, TaskPicker, Toasts, Confirm, PrintChecklist...
  views/                         Dashboard, Tasks, Board, Timeline, MyTasks, Expo, Settings
```

## How the modules fit

`seed.ts` → `storage.load()` (migrated) → Zustand store holds `AppData` (`schemaVersion`, tasks, workstreams, settings, snapshots, expoChecks). Every mutating action calls a pure function from `tree.ts`, which returns `{ ok, tasks } | { ok: false, error }`. Errors (cycles, invalid indents) become toasts. A store subscription debounces `storage.save()` by 500 ms and flushes on page hide. `progress.ts` derives everything the views show (memoised per tasks array). Undo stores the before-versions of only the tasks an action touched, and restores those.

## Build order

1. Scaffold, Tailwind theme from logo colours.
2. `dates.ts`, `tree.ts`, `progress.ts`, `quickadd.ts`, plus Vitest tests (all A11 cases).
3. Seed generator → `seed.ts` + seed integrity test.
4. Storage adapter + migrations + export/import round-trip test.
5. Views: Tasks tree → Dashboard → quick-add → drawer → Board → Timeline → My tasks → Expo mode → Settings.
6. Print stylesheet, responsive pass (375 / 768 / 1440), acceptance walk-through in a real browser.
