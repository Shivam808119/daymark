import { useEffect, useMemo, useState } from 'react';
import { listOwned } from './lib/api';
import type { BookNote, BookRow, Expense, Goal, Reflection, Task } from './lib/types';
import { longDate, money } from './util';
import type { Page } from './util';

type Hit = { key: string; group: string; icon: string; title: string; sub?: string; page: Page; date?: string };
type Data = { tasks: Task[]; ref: Reflection[]; books: BookRow[]; goals: Goal[]; exp: Expense[]; notes: BookNote[] };

export function Search({ onGo, onClose }: { onGo: (p: Page, d?: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    void Promise.all([
      listOwned<Task>('tasks').catch(() => [] as Task[]),
      listOwned<Reflection>('daily_reflections').catch(() => [] as Reflection[]),
      listOwned<BookRow>('books').catch(() => [] as BookRow[]),
      listOwned<Goal>('goals').catch(() => [] as Goal[]),
      listOwned<Expense>('expenses').catch(() => [] as Expense[]),
      listOwned<BookNote>('book_notes').catch(() => [] as BookNote[]),
    ]).then(([tasks, ref, books, goals, exp, notes]) => setD({ tasks, ref, books, goals, exp, notes }));
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!d || n.length < 2) return [] as Hit[];
    const has = (...v: (string | null | undefined)[]) => v.some(x => (x ?? '').toLowerCase().includes(n));
    const out: Hit[] = [];
    d.tasks.filter(t => has(t.title)).slice(0, 6).forEach(t => out.push({ key: `t${t.id}`, group: 'Tasks', icon: t.status === 'done' ? '✓' : '○', title: t.title, sub: t.due_date ? longDate(t.due_date) : undefined, page: 'today', date: t.due_date ?? undefined }));
    d.ref.filter(r => has(r.daily_target, r.completed, r.learned, r.improve_tomorrow)).slice(0, 6).forEach(r => out.push({ key: `r${r.id}`, group: 'Diary', icon: '📓', title: longDate(r.entry_date), sub: (r.completed || r.learned || r.daily_target || '').replace(/\n/g, ' ').slice(0, 90), page: 'review', date: r.entry_date }));
    d.goals.filter(g => has(g.title, (g as Goal & { notes?: string | null }).notes)).slice(0, 6).forEach(g => out.push({ key: `g${g.id}`, group: 'Goals', icon: '🎯', title: g.title, sub: `${g.start_date} → ${g.deadline}`, page: 'goals' }));
    d.books.filter(b => has(b.title, b.author)).slice(0, 6).forEach(b => out.push({ key: `b${b.id}`, group: 'Books', icon: '📚', title: b.title, sub: b.author ?? undefined, page: 'books' }));
    d.notes.filter(x => has(x.note)).slice(0, 6).forEach(x => out.push({ key: `n${x.id}`, group: 'Book notes', icon: '📝', title: x.note.slice(0, 90), sub: d.books.find(b => b.id === x.book_id)?.title, page: 'books' }));
    d.exp.filter(e => has(e.note, e.category)).slice(0, 6).forEach(e => out.push({ key: `e${e.id}`, group: 'Expenses', icon: '₹', title: `${e.note || e.category} · ${money(Number(e.amount))}`, sub: longDate(e.spent_on), page: 'expenses' }));
    return out;
  }, [q, d]);

  const groups = [...new Set(hits.map(h => h.group))];
  return (
    <div className="sheet-wrap top" onClick={onClose}>
      <div className="sheet search-sheet" role="dialog" aria-label="Search" onClick={e => e.stopPropagation()}>
        <div className="search-input">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks, diary, goals, books, expenses…" />
          <button className="chip" onClick={onClose}>Esc</button>
        </div>
        <div className="search-results">
          {!d && <p className="empty">Loading…</p>}
          {d && q.trim().length < 2 && <p className="empty">Type at least 2 letters. Tip: press Ctrl+K anywhere to search.</p>}
          {d && q.trim().length >= 2 && !hits.length && <p className="empty">Nothing found for “{q}”.</p>}
          {groups.map(g => (
            <div key={g}>
              <p className="kicker" style={{ margin: '14px 4px 6px' }}>{g}</p>
              {hits.filter(h => h.group === g).map(h => (
                <button key={h.key} className="hit" onClick={() => onGo(h.page, h.date ?? null)}>
                  <span className="tx-i">{h.icon}</span>
                  <span className="tx-b"><b>{h.title}</b>{h.sub && <small>{h.sub}</small>}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
