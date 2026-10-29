import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { listOwned, removeOwned, saveOwned, updateOwned, upsertMany } from './lib/api';
import { notify } from './lib/notify';
import { isoToday } from './lib/planning';
import type { Expense, Recurring } from './lib/types';
import { Title } from './ui';
import { download, failure, money, ord, pad, parse, shiftMonth, shortDate, store } from './util';

const CATS: [string, string][] = [['Food', '🍽'], ['Travel', '🚌'], ['Study', '📚'], ['Shopping', '🛍'], ['Bills', '💡'], ['Health', '💊'], ['Fun', '🎬'], ['Other', '🧾']];
const ic = (c: string) => CATS.find(x => x[0] === c)?.[1] ?? '🧾';
const METHODS = ['UPI', 'Cash', 'Card', 'Other'];

/** The date a monthly bill falls on in a given month (clamped for short months). */
const dueDate = (key: string, day: number) => {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`;
};

export function Expenses() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Recurring[]>([]);
  const [month, setMonth] = useState(() => `${isoToday().slice(0, 8)}01`);
  const [cat, setCat] = useState('all');
  const [msg, setMsg] = useState('');
  const [budget, setBudget] = useState(() => Number(store.get('daymark-budget') ?? 0));
  const today = isoToday();
  const todayKey = today.slice(0, 7);

  const load = useCallback(async () => {
    try {
      const [e, r] = await Promise.all([listOwned<Expense>('expenses'), listOwned<Recurring>('recurring_expenses').catch(() => [] as Recurring[])]);
      // Add this month's bills once their day has arrived.
      const due = r.filter(x => x.active && (x.last_month ?? '') < todayKey && dueDate(todayKey, x.day_of_month) <= today);
      if (due.length) {
        await upsertMany('expenses', due.map(x => ({ amount: x.amount, category: x.category, note: x.note, method: x.method, spent_on: dueDate(todayKey, x.day_of_month), recurring_id: x.id })), 'recurring_id,spent_on', true);
        for (const x of due) await updateOwned('recurring_expenses', x.id, { last_month: todayKey }, true);
        notify(`Added ${due.length} monthly bill${due.length === 1 ? '' : 's'} ✓`);
        const [e2, r2] = await Promise.all([listOwned<Expense>('expenses'), listOwned<Recurring>('recurring_expenses')]);
        setRows(e2); setBills(r2);
      } else { setRows(e); setBills(r); }
      setMsg('');
    } catch (err) { setMsg(failure(err)); }
  }, [today, todayKey]);
  useEffect(() => { void load(); }, [load]);

  const key = month.slice(0, 7);
  const prevKey = shiftMonth(month, -1).slice(0, 7);
  const inMonth = useMemo(() => rows.filter(r => r.spent_on.startsWith(key)), [rows, key]);
  const total = inMonth.reduce((a, r) => a + Number(r.amount), 0);
  const prevTotal = rows.filter(r => r.spent_on.startsWith(prevKey)).reduce((a, r) => a + Number(r.amount), 0);
  const todayTotal = rows.filter(r => r.spent_on === today).reduce((a, r) => a + Number(r.amount), 0);
  const days = key === todayKey ? parse(today).getDate() : new Date(parse(month).getFullYear(), parse(month).getMonth() + 1, 0).getDate();
  const byCat = CATS.map(([c]) => ({ c, v: inMonth.filter(r => r.category === c).reduce((a, r) => a + Number(r.amount), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const list = inMonth.filter(r => cat === 'all' || r.category === cat).sort((a, b) => (a.spent_on === b.spent_on ? 0 : a.spent_on < b.spent_on ? 1 : -1));
  const groups = [...new Set(list.map(r => r.spent_on))];
  const left = budget ? budget - total : 0;
  const pending = bills.filter(b => b.active && (b.last_month ?? '') < todayKey);
  const pendingTotal = pending.reduce((a, b) => a + Number(b.amount), 0);
  const monthlyTotal = bills.filter(b => b.active).reduce((a, b) => a + Number(b.amount), 0);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const amount = Number(f.get('amount'));
    if (!(amount > 0)) { setMsg('Enter an amount greater than 0.'); return; }
    try {
      await saveOwned('expenses', { amount, category: String(f.get('category')), note: String(f.get('note') ?? '').trim() || null, spent_on: String(f.get('date')), method: String(f.get('method')) });
      form.reset();
      await load();
    } catch (err) { setMsg(failure(err)); }
  }
  async function addBill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const amount = Number(f.get('amount'));
    const day = Math.min(31, Math.max(1, Number(f.get('day')) || 1));
    if (!(amount > 0)) { setMsg('Enter the bill amount.'); return; }
    const passed = dueDate(todayKey, day) <= today;
    const addNow = f.get('now') === 'on';
    const prev = shiftMonth(today, -1).slice(0, 7);
    try {
      await saveOwned('recurring_expenses', {
        amount, category: String(f.get('category')), note: String(f.get('note') ?? '').trim() || null, method: String(f.get('method')),
        day_of_month: day, active: true, last_month: passed && addNow ? prev : todayKey,
      });
      form.reset();
      await load();
    } catch (err) { setMsg(failure(err)); }
  }
  async function del(r: Expense) {
    try { await removeOwned('expenses', r.id); await load(); } catch (e) { setMsg(failure(e)); }
  }
  async function delBill(b: Recurring) {
    if (!window.confirm(`Stop the monthly bill “${b.note || b.category}”? Past expenses stay.`)) return;
    try { await removeOwned('recurring_expenses', b.id); await load(); } catch (e) { setMsg(failure(e)); }
  }
  function setBud() {
    const v = window.prompt('Monthly budget in ₹ (0 to remove):', String(budget || ''));
    if (v === null) return;
    const n = Math.max(0, Number(v) || 0);
    store.set('daymark-budget', String(n));
    setBudget(n);
    notify('Budget saved ✓');
  }
  function exportCsv() {
    const q = (s: string | null) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['date,category,amount,method,note', ...[...rows].sort((a, b) => (a.spent_on < b.spent_on ? -1 : 1)).map(r => `${r.spent_on},${q(r.category)},${r.amount},${q(r.method)},${q(r.note)}`)].join('\n');
    download(`daymark-expenses-${today}.csv`, csv, 'text/csv');
  }

  return (
    <section>
      <Title eyebrow="Money" title="Where your money goes." text="Add what you spend, see it by month and category, and stay inside your budget." />
      <div className="yearbar">
        <button className="chip" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <b>{parse(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button className="chip" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
        <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </div>

      <div className="stats">
        <article className="stat"><b>{money(total)}</b><span>spent this month{prevTotal ? ` (${total >= prevTotal ? '+' : '−'}${Math.round(Math.abs(total - prevTotal) / prevTotal * 100)}% vs last)` : ''}</span></article>
        <article className="stat"><b>{money(todayTotal)}</b><span>spent today</span></article>
        <article className="stat"><b>{money(Math.round(total / Math.max(1, days)))}</b><span>average per day</span></article>
        <article className="stat" onClick={setBud} style={{ cursor: 'pointer' }}>
          <b style={budget && left < 0 ? { color: 'var(--danger)' } : undefined}>{budget ? money(Math.abs(left)) : 'Set'}</b>
          <span>{budget ? (left >= 0 ? `left of ${money(budget)} budget` : 'over budget') : 'monthly budget (tap)'}</span>
        </article>
      </div>
      {budget > 0 && <div className="meter big"><i style={{ width: `${Math.min(100, (total / budget) * 100)}%`, background: total > budget ? 'var(--danger)' : undefined }} /></div>}
      {key === todayKey && pending.length > 0 && (
        <div className="banner">
          <span>🔔</span>
          <div><b>{money(pendingTotal)} still to come this month</b><small>{pending.length} bill{pending.length === 1 ? '' : 's'}: {pending.map(p => `${p.note || p.category} (${ord(p.day_of_month)})`).join(', ')}</small></div>
        </div>
      )}

      <form className="panel exp-form" onSubmit={add}>
        <h2>Add expense</h2>
        <div className="gf-row">
          <label>Amount (₹)<input name="amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" required /></label>
          <label>Category<select name="category">{CATS.map(([c, i]) => <option key={c} value={c}>{i} {c}</option>)}</select></label>
          <label>Date<input name="date" type="date" defaultValue={today} max={today} required /></label>
          <label>Paid by<select name="method">{METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
        </div>
        <div className="step-add"><input name="note" placeholder="What was it for? (optional)" /><button className="btn">Add</button></div>
      </form>
      {msg && <small className="error">{msg}</small>}

      <article className="panel" style={{ marginTop: 22 }}>
        <div className="panel-head"><h2>Monthly bills</h2><small className="g-hint">{bills.length ? `${money(monthlyTotal)} every month` : 'Rent, recharge, subscriptions…'}</small></div>
        <p className="g-notes" style={{ margin: '6px 0 12px' }}>Add a bill once. It is added to your expenses automatically on its day, every month.</p>
        {bills.map(b => <BillRow key={b.id} b={b} added={(b.last_month ?? '') >= todayKey} onDelete={() => void delBill(b)} onSaved={load} />)}
        <form className="bill-form" onSubmit={addBill}>
          <div className="gf-row">
            <label>Amount (₹)<input name="amount" type="number" inputMode="decimal" min="0" step="0.01" required /></label>
            <label>Day of month<input name="day" type="number" min="1" max="31" defaultValue={1} required /></label>
            <label>Category<select name="category" defaultValue="Bills">{CATS.map(([c, i]) => <option key={c} value={c}>{i} {c}</option>)}</select></label>
            <label>Paid by<select name="method">{METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
          </div>
          <div className="step-add"><input name="note" placeholder="Name, e.g. Room rent, Mobile recharge" /><button className="btn">Add bill</button></div>
          <label className="repeat"><input type="checkbox" name="now" defaultChecked /> If this month’s day has already passed, add it now</label>
        </form>
      </article>

      <div className="two" style={{ marginTop: 22 }}>
        <article className="panel">
          <h2>By category</h2>
          {byCat.map(x => (
            <button key={x.c} className="catrow" onClick={() => setCat(cat === x.c ? 'all' : x.c)}>
              <span>{ic(x.c)} {x.c}</span><b>{money(x.v)}</b>
              <div className="meter"><i style={{ width: `${(x.v / (byCat[0]?.v || 1)) * 100}%` }} /></div>
            </button>
          ))}
          {!byCat.length && <p className="empty">No spending recorded this month.</p>}
        </article>
        <article className="panel">
          <div className="panel-head"><h2>Transactions</h2>{cat !== 'all' && <button className="chip on" onClick={() => setCat('all')}>{cat} ✕</button>}</div>
          {groups.map(d => (
            <div key={d} className="txgroup">
              <p className="kicker">{shortDate(d)} · {money(list.filter(r => r.spent_on === d).reduce((a, r) => a + Number(r.amount), 0))}</p>
              {list.filter(r => r.spent_on === d).map(r => <ExpenseRow key={r.id} r={r} today={today} onDelete={() => void del(r)} onSaved={load} />)}
            </div>
          ))}
          {!groups.length && <p className="empty">Nothing here yet. Add your first expense above.</p>}
        </article>
      </div>
    </section>
  );
}

const catOptions = CATS.map(([c, i]) => <option key={c} value={c}>{i} {c}</option>);
const methodOptions = METHODS.map(m => <option key={m}>{m}</option>);

function ExpenseRow({ r, today, onDelete, onSaved }: { r: Expense; today: string; onDelete: () => void; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    if (!(amount > 0)) { setErr('Enter an amount greater than 0.'); return; }
    try {
      await updateOwned('expenses', r.id, { amount, category: String(f.get('category')), spent_on: String(f.get('date')), method: String(f.get('method')), note: String(f.get('note') ?? '').trim() || null });
      setEdit(false);
      setErr('');
      await onSaved();
    } catch (error) { setErr(failure(error)); }
  }
  if (edit) {
    return (
      <form className="edit-form" onSubmit={e => void save(e)}>
        <div className="gf-row">
          <label>Amount (₹)<input name="amount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={r.amount} required /></label>
          <label>Category<select name="category" defaultValue={r.category}>{catOptions}</select></label>
          <label>Date<input name="date" type="date" defaultValue={r.spent_on} max={today} required /></label>
          <label>Paid by<select name="method" defaultValue={r.method ?? 'Other'}>{methodOptions}</select></label>
        </div>
        <input name="note" defaultValue={r.note ?? ''} placeholder="What was it for? (optional)" aria-label="Note" />
        {err && <small className="error">{err}</small>}
        <div className="row">
          <button className="chip on">Save</button>
          <button type="button" className="plain" onClick={() => { setEdit(false); setErr(''); }}>Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <div className="tx">
      <span className="tx-i">{ic(r.category)}</span>
      <span className="tx-b"><b>{r.note || r.category}</b><small>{r.category}{r.method ? ` · ${r.method}` : ''}{r.recurring_id ? ' · monthly bill' : ''}</small></span>
      <b>{money(Number(r.amount))}</b>
      <button className="plain edit" onClick={() => setEdit(true)} aria-label="Edit expense">✎</button>
      <button className="plain" onClick={onDelete} aria-label="Delete expense">✕</button>
    </div>
  );
}

function BillRow({ b, added, onDelete, onSaved }: { b: Recurring; added: boolean; onDelete: () => void; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    const day = Math.min(31, Math.max(1, Number(f.get('day')) || 1));
    if (!(amount > 0)) { setErr('Enter the bill amount.'); return; }
    try {
      await updateOwned('recurring_expenses', b.id, { amount, day_of_month: day, category: String(f.get('category')), method: String(f.get('method')), note: String(f.get('note') ?? '').trim() || null });
      setEdit(false);
      setErr('');
      await onSaved();
    } catch (error) { setErr(failure(error)); }
  }
  if (edit) {
    return (
      <form className="edit-form" onSubmit={e => void save(e)}>
        <div className="gf-row">
          <label>Amount (₹)<input name="amount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={b.amount} required /></label>
          <label>Day of month<input name="day" type="number" min="1" max="31" defaultValue={b.day_of_month} required /></label>
          <label>Category<select name="category" defaultValue={b.category}>{catOptions}</select></label>
          <label>Paid by<select name="method" defaultValue={b.method ?? 'Other'}>{methodOptions}</select></label>
        </div>
        <input name="note" defaultValue={b.note ?? ''} placeholder="Name, e.g. Room rent" aria-label="Name" />
        <small className="g-hint">Changes apply from the next time this bill is added. Expenses already added stay as they are.</small>
        {err && <small className="error">{err}</small>}
        <div className="row">
          <button className="chip on">Save</button>
          <button type="button" className="plain" onClick={() => { setEdit(false); setErr(''); }}>Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <div className="tx">
      <span className="tx-i">{ic(b.category)}</span>
      <span className="tx-b"><b>{b.note || b.category}</b><small>Every month on the {ord(b.day_of_month)} · {added ? 'added this month ✓' : 'coming up'}</small></span>
      <b>{money(Number(b.amount))}</b>
      <button className="plain edit" onClick={() => setEdit(true)} aria-label="Edit this bill">✎</button>
      <button className="plain" onClick={onDelete} aria-label="Stop this bill">✕</button>
    </div>
  );
}
