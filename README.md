# Swamikri Labs · KISAN 2026 Expo Tracker

Planning tracker for showing ASTRA at KISAN Agri Show 2026 (9 to 13 Dec, PIECC Pune). It comes loaded with 33 starting tasks in 4 categories (Stall Inputs, Design, ASTRA, Treadmill Setup) from `docs/KISAN2026_TASKS.md`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 while developing
npm run build      # type-check + production build into dist/
npm run preview    # serve the built app at http://localhost:4173
npm run test       # 83 unit tests
npm run seed       # regenerate src/data/seed.ts from docs/KISAN2026_TASKS.md (only if that list changes)
```

`dist/` is a plain static site with relative paths, so it can also go on Vercel, Netlify or GitHub Pages later with no config. Vercel: import the folder, framework "Vite", output `dist`.

## Where the data lives

Each browser keeps its own copy (localStorage, autosaved). **Nothing is shared between devices automatically.** To share, one person exports a JSON backup (Settings → Export JSON backup) and others import it (Replace or Merge by id). Export a backup regularly.

## How to use

- **Add a task:** press `n` (or the green **Add task** button) and type, for example:
  `Order standee frame #design @Anurag !p0 due:nov30 ^design-10`
  - `#stall`, `#design`, `#astra`, `#tread` category (no tag → INBOX, shown as a badge on the dashboard until triaged)
  - `@Anurag` person on the task; repeat for several people (`@Anurag @Ravi`), `@"Full Name"` for names with spaces
  - `!p0` / `!p1` / `!p2` priority (default P1)
  - `due:` accepts `nov30`, `30/11`, `2026-11-30`, `today`, `tomorrow`, `mon`, `+3`
  - `^design-10` makes it a subtask of that task (by id), or `^"title words"`
- **Make a task a subtask (or back):**
  - Row menu `⋯` → **Move under…** (searchable) or **Make main task**
  - Keyboard in Tasks: select a row, then `Tab` (subtask of the row above) or `Shift+Tab` (up a level)
  - Drag the `⋮⋮` handle: drop *on* a task to nest it, drop on the line *between* tasks to reorder. On a phone, press and hold the handle first.
  - Children always move with their parent. Moving a task under itself is blocked.
- **People on a task:** open the task and use **People**. Type a name and press Enter, or tap a team member's name. Click × to remove someone. A task can have any number of people. **My tasks** and the person filter show every task a person is on, including shared ones. To add or remove a person on many tasks at once, use **Select multiple** in Tasks.
- **Add subtasks:** `+` on a row (or `a`), or in the task drawer under Subtasks.
- **Mark done:** tick the checkbox. Ticking a parent ticks all its subtasks (with Undo).
- **Delete:** row menu or `Delete`. Every delete has a 10-second **Undo**.
- **Search and filter:** `/` to search; **Filters** for category, owner, status, priority, overdue, has cost. Filters are in the URL, so a filtered view can be bookmarked.
- **Expo mode:** a big-button phone checklist built from tasks in an `ONSITE` category (setup day, each expo day, dismantle). The current list has no ONSITE category, so this screen is empty until you add one.
- **Backup:** Settings → **Export JSON backup**. Also CSV export and **Print checklist** (A4, browser Print → Save as PDF).
- `?` shows all keyboard shortcuts.

Tip: add `?today=2026-12-10` before the `#` in the URL to rehearse how the app looks on a future date (for example Expo mode on Day 2). It does not change any data.
