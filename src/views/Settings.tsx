import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Printer, RotateCcw, Upload, X } from 'lucide-react';
import { useData, useWorkstreams } from '../store';
import { extractData } from '../store/data';
import { askChoice, toast } from '../store/ui';
import { migrate } from '../storage/migrate';
import { toCsv } from '../lib/csv';
import { isIsoDate, todayIST } from '../lib/dates';
import { WsDot } from '../components/ui';
import { SEED_TASKS } from '../data/seed';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsView() {
  const settings = useData((s) => s.settings);
  const tasks = useData((s) => s.tasks);
  const update = useData((s) => s.updateSettings);
  const workstreams = useWorkstreams();
  const [member, setMember] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const data = extractData(useData.getState());
    download(`kisan2026-tracker-backup-${todayIST()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Backup downloaded', { kind: 'success' });
  };
  const exportCsv = () => {
    const s = useData.getState();
    download(`kisan2026-tasks-${todayIST()}.csv`, '﻿' + toCsv(s.tasks, s.workstreams), 'text/csv;charset=utf-8');
  };

  const onImport = async (file: File) => {
    let data;
    try {
      data = migrate(JSON.parse(await file.text()));
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, { kind: 'error' });
      return;
    }
    const mode = await askChoice({
      title: `Import ${data.tasks.length} tasks from ${file.name}?`,
      body: 'Tip: export a backup of the current state first.',
      options: [
        { value: 'replace', label: 'Replace everything', description: 'The tracker becomes exactly the backup.', tone: 'primary' },
        { value: 'merge', label: 'Merge by task id', description: 'Tasks in the backup overwrite matching ids; new ones are added. Nothing is deleted.' },
      ],
    });
    if (!mode) return;
    try {
      useData.getState().importData(data, mode);
      toast(mode === 'replace' ? 'Backup restored' : 'Backup merged', { kind: 'success' });
    } catch (e) {
      toast((e as Error).message, { kind: 'error' });
    }
  };

  const reset = async () => {
    const c = await askChoice({
      title: 'Reset to the seed plan?',
      body: `This replaces all ${tasks.length} tasks, statuses, owners and costs with the original plan. Export a backup first if you might need it.`,
      typeToConfirm: 'RESET',
      options: [{ value: 'reset', label: 'Reset to seed plan', tone: 'danger' }],
    });
    if (c !== 'reset') return;
    useData.getState().resetToSeed();
    toast('Tracker reset to the seed plan', { kind: 'success' });
  };

  const addMember = () => {
    const m = member.trim();
    if (!m) return;
    if (settings.teamMembers.some((x) => x.toLowerCase() === m.toLowerCase())) {
      toast(`${m} is already on the team`, { kind: 'error' });
      return;
    }
    update({ teamMembers: [...settings.teamMembers, m] });
    setMember('');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Card title="Key dates" desc="Countdowns and expo mode use these. All dates are local Pune dates (Asia/Kolkata).">
        <div className="grid gap-3 sm:grid-cols-3">
          <DateField label="Move-in / setup" value={settings.setupDate} onChange={(v) => update({ setupDate: v })} />
          <DateField label="Expo opens" value={settings.expoStart} onChange={(v) => update({ expoStart: v })} />
          <DateField label="Expo closes" value={settings.expoEnd} onChange={(v) => update({ expoEnd: v })} />
        </div>
        <p className="mt-2 text-xs text-ink-faint">Gate dates follow their milestone tasks: change a gate by editing its milestone's due date.</p>
      </Card>

      <Card title="Team members" desc="Used for owner suggestions and the My tasks view.">
        <div className="flex flex-wrap gap-2">
          {settings.teamMembers.map((m) => (
            <span key={m} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white pl-3 pr-1 text-sm">
              {m}
              <button
                className="icon-btn h-6 w-6"
                aria-label={`Remove ${m}`}
                onClick={() => update({ teamMembers: settings.teamMembers.filter((x) => x !== m) })}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {settings.teamMembers.length === 0 && <span className="text-sm text-ink-faint">No team members yet.</span>}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addMember();
          }}
        >
          <input className="input max-w-xs" placeholder="Name" value={member} onChange={(e) => setMember(e.target.value)} aria-label="New team member" />
          <button className="btn-secondary" type="submit">
            <Plus size={15} /> Add
          </button>
        </form>
      </Card>

      <Card title="Backup and export" desc="Data lives in this browser only. Export a JSON backup regularly and to share with the team.">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportJson}>
            <Download size={15} /> Export JSON backup
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import JSON…
          </button>
          <button className="btn-secondary" onClick={exportCsv}>
            <FileSpreadsheet size={15} /> Export CSV
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={15} /> Print checklist (A4)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onImport(f);
            }}
          />
        </div>
      </Card>

      <Card title="Categories" desc="Rename or recolour categories, or add a new one. Tasks can be moved between categories from the task details.">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {workstreams.map((w) => (
            <li key={w.code} className="flex items-center gap-3 px-3 py-2">
              <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full" title="Change colour">
                <WsDot color={w.color} size={24} />
                <input
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={w.color}
                  onChange={(e) => useData.getState().upsertWorkstream({ ...w, color: e.target.value })}
                  aria-label={`Colour for ${w.code}`}
                />
              </label>
              <span className="w-20 shrink-0 font-mono text-xs text-ink-muted">{w.code}</span>
              <input
                className="input h-8"
                defaultValue={w.name}
                aria-label={`Name for ${w.code}`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && useData.getState().upsertWorkstream({ ...w, name: e.target.value.trim() })}
              />
            </li>
          ))}
        </ul>
        <NewWorkstream nextOrder={workstreams.length} />
      </Card>

      <Card title="Reset" desc={`Start over from the original ${SEED_TASKS.length}-task list.`}>
        <button className="btn-secondary border-danger/40 text-danger hover:bg-danger-50" onClick={() => void reset()}>
          <RotateCcw size={15} /> Reset to seed plan…
        </button>
      </Card>
    </div>
  );
}

function NewWorkstream({ nextOrder }: { nextOrder: number }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  return (
    <form
      className="mt-3 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (!c || !name.trim()) return;
        if (useData.getState().workstreams.some((w) => w.code === c)) {
          toast(`${c} already exists`, { kind: 'error' });
          return;
        }
        useData.getState().upsertWorkstream({ code: c, name: name.trim(), color: '#475569', order: nextOrder });
        setCode('');
        setName('');
      }}
    >
      <input className="input w-28" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} aria-label="New category code" />
      <input className="input min-w-[10rem] flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New category name" />
      <button className="btn-secondary" type="submit">
        <Plus size={15} /> Add category
      </button>
    </form>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {desc && <p className="mb-4 mt-0.5 text-sm text-ink-muted">{desc}</p>}
      {children}
    </section>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="date" className="input" value={value} onChange={(e) => isIsoDate(e.target.value) && onChange(e.target.value)} />
    </label>
  );
}
