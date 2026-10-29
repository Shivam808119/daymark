import { useState } from 'react';
import { listOwned, upsertMany } from './lib/api';
import { notify } from './lib/notify';
import { isoToday } from './lib/planning';
import { download, failure } from './util';

// Order matters when restoring: parents come before the rows that point to them.
const TABLES = ['tasks', 'daily_reflections', 'goals', 'goal_steps', 'book_subjects', 'books', 'book_notes', 'reading_log', 'recurring_expenses', 'expenses', 'daily_habits', 'routine_tasks'];

export function Backup() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');

  async function exportAll() {
    setBusy(true);
    try {
      const tables: Record<string, unknown[]> = {};
      for (const t of TABLES) tables[t] = await listOwned<unknown>(t).catch(() => []);
      download(`daymark-backup-${isoToday()}.json`, JSON.stringify({ app: 'daymark', version: 2, exported_at: new Date().toISOString(), tables }, null, 2), 'application/json');
      notify('Backup downloaded ✓');
    } finally { setBusy(false); }
  }

  async function restore(file: File) {
    setReport('');
    let data: { app?: string; tables?: Record<string, Record<string, unknown>[]>; tasks?: Record<string, unknown>[]; reflections?: Record<string, unknown>[]; books?: Record<string, unknown>[] };
    try { data = JSON.parse(await file.text()); } catch { notify('That file is not a valid backup.', 'error'); return; }
    // Older backups only had tasks, reflections and books.
    const tables = data.tables ?? (data.tasks || data.reflections || data.books ? { tasks: data.tasks ?? [], daily_reflections: data.reflections ?? [], books: data.books ?? [] } : null);
    if (!tables) { notify('That file is not a Daymark backup.', 'error'); return; }
    const total = TABLES.reduce((a, t) => a + (tables[t]?.length ?? 0), 0);
    if (!window.confirm(`Restore ${total} items from this backup? Items that already exist are updated, nothing is deleted.`)) return;
    setBusy(true);
    const lines: string[] = [];
    for (const t of TABLES) {
      const rows = tables[t] ?? [];
      if (!rows.length) continue;
      try { lines.push(`✓ ${t}: ${await upsertMany(t, rows)} restored`); }
      catch (e) { lines.push(`✗ ${t}: ${failure(e)}`); }
    }
    setReport(lines.join('\n'));
    setBusy(false);
    notify(lines.some(l => l.startsWith('✗')) ? 'Restore finished with some problems.' : 'Backup restored ✓', lines.some(l => l.startsWith('✗')) ? 'error' : 'ok');
  }

  return (
    <article className="setting col">
      <div><h3>Backup &amp; restore</h3><p>Download everything (tasks, diary, goals, books info, notes, expenses, habits) as one file, or restore from a file. Uploaded book files are not inside the backup.</p></div>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => void exportAll()}>{busy ? 'Working…' : 'Download backup'}</button>
        <label className="btn ghost filebtn">Restore from file<input type="file" accept="application/json,.json" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} /></label>
      </div>
      {report && <pre className="report">{report}</pre>}
    </article>
  );
}
