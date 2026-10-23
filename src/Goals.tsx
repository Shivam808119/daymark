import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { listOwned, removeOwned, saveOwned, updateOwned } from './lib/api';
import { isoToday } from './lib/planning';
import type { Goal, GoalStep } from './lib/types';
import { Title } from './ui';
import { failure, parse } from './util';

type G = Goal & { category?: string | null; notes?: string | null };
const CATS: [string, string][] = [['personal', '🌱'], ['study', '📚'], ['health', '💪'], ['career', '💼'], ['money', '💰'], ['skill', '🛠']];
const icon = (c?: string | null) => CATS.find(x => x[0] === c)?.[1] ?? '🎯';

export function Goals() {
  const year0 = parse(isoToday()).getFullYear();
  const [year, setYear] = useState(year0);
  const [goals, setGoals] = useState<G[]>([]);
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('all');

  const load = useCallback(async () => {
    try {
      const [g, s] = await Promise.all([listOwned<G>('goals'), listOwned<GoalStep>('goal_steps').catch(() => [])]);
      setGoals(g.sort((a, b) => (a.deadline < b.deadline ? -1 : 1)));
      setSteps(s);
      setMsg('');
    } catch (e) { setMsg(failure(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const today = parse(isoToday()).getTime();
  const inYear = goals.filter(g => parse(g.start_date).getFullYear() <= year && parse(g.deadline).getFullYear() >= year);
  const shown = inYear.filter(g => cat === 'all' || g.category === cat);
  const prog = (g: G) => {
    const st = steps.filter(s => s.goal_id === g.id);
    return st.length ? Math.round((st.filter(s => s.done).length / st.length) * 100) : Number(g.completion_percentage ?? 0);
  };
  const isDone = (g: G) => prog(g) >= 100;
  const done = inYear.filter(isDone).length;
  const late = inYear.filter(g => !isDone(g) && parse(g.deadline).getTime() < today).length;
  const avg = inYear.length ? Math.round(inYear.reduce((a, g) => a + prog(g), 0) / inYear.length) : 0;

  async function run(fn: () => Promise<unknown>) {
    try { await fn(); await load(); } catch (e) { setMsg(failure(e)); }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const start = String(f.get('start'));
    const deadline = String(f.get('deadline'));
    if (deadline < start) { setMsg('The end date must be after the start date.'); return; }
    await run(async () => {
      await saveOwned('goals', { title: String(f.get('title')).trim(), notes: String(f.get('notes') ?? ''), category: String(f.get('category')), start_date: start, deadline, priority: 'medium', status: 'active', completion_percentage: 0 });
      form.reset();
      setAdding(false);
    });
  }
  const remove = (g: G) => {
    if (window.confirm(`Delete the goal “${g.title}”? This cannot be undone.`)) void run(() => removeOwned('goals', g.id));
  };

  return (
    <section>
      <Title eyebrow="Long view" title={`My ${year} goals.`} text="Write what you plan this year, track what you finish, and see how far you have come." />
      <div className="yearbar">
        <button className="chip" onClick={() => setYear(year - 1)}>‹ {year - 1}</button>
        <b>{year}</b>
        <button className="chip" onClick={() => setYear(year + 1)}>{year + 1} ›</button>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setAdding(!adding)}>{adding ? 'Close' : '+ New goal'}</button>
      </div>

      <div className="stats">
        <article className="stat"><b>{inYear.length}</b><span>planned this year</span></article>
        <article className="stat"><b>{done}</b><span>completed</span></article>
        <article className="stat"><b>{avg}%</b><span>average progress</span></article>
        <article className="stat"><b style={late ? { color: 'var(--danger)' } : undefined}>{late}</b><span>overdue</span></article>
      </div>
      {inYear.length > 0 && <div className="meter big"><i style={{ width: `${(done / inYear.length) * 100}%` }} /></div>}

      {adding && (
        <form className="panel goal-form" onSubmit={add}>
          <h2>Plan a new goal</h2>
          <input name="title" placeholder="What do you want to achieve? e.g. Finish DSA course" required />
          <textarea name="notes" placeholder="Why it matters / how you will do it (optional)" />
          <div className="gf-row">
            <label>Category<select name="category">{CATS.map(([c, i]) => <option key={c} value={c}>{i} {c}</option>)}</select></label>
            <label>Start date<input name="start" type="date" defaultValue={isoToday()} required /></label>
            <label>End date<input name="deadline" type="date" defaultValue={`${year}-12-31`} required /></label>
          </div>
          <button className="btn">Add goal</button>
        </form>
      )}
      {msg && <small className="error">{msg}</small>}

      <div className="chips">
        {['all', ...CATS.map(c => c[0])].map(c => <button key={c} className={`chip cap ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c === 'all' ? 'All' : `${icon(c)} ${c}`}</button>)}
      </div>

      <div className="grid goals-grid">
        {shown.map(g => <GoalCard key={g.id} g={g} steps={steps.filter(s => s.goal_id === g.id)} p={prog(g)} finished={isDone(g)} today={today} run={run} remove={() => remove(g)} />)}
      </div>
      {!shown.length && <p className="empty">{inYear.length ? 'No goals in this category.' : `No goals for ${year} yet. Click “New goal” and write the first thing you want to finish this year.`}</p>}
    </section>
  );
}

function GoalCard({ g, steps, p, finished, today, run, remove }: { g: G; steps: GoalStep[]; p: number; finished: boolean; today: number; run: (f: () => Promise<unknown>) => Promise<void>; remove: () => void }) {
  const [step, setStep] = useState('');
  const [open, setOpen] = useState(false);
  const start = parse(g.start_date).getTime();
  const end = parse(g.deadline).getTime();
  const daysLeft = Math.round((end - today) / 86400000);
  const elapsed = useMemo(() => (end > start ? Math.min(100, Math.max(0, Math.round(((today - start) / (end - start)) * 100))) : 100), [start, end, today]);
  const hasSteps = steps.length > 0;
  const setProg = (v: number) => run(() => updateOwned('goals', g.id, { completion_percentage: v }));

  return (
    <article className={`goal ${finished ? 'fin' : ''}`}>
      <div className="g-top">
        <span className={`badge ${!finished && daysLeft < 0 ? 'late' : ''}`}>{finished ? 'done ✓' : daysLeft < 0 ? 'overdue' : `${icon(g.category)} ${g.category ?? 'goal'}`}</span>
        <button className="plain" onClick={remove} aria-label={`Delete ${g.title}`}>Delete</button>
      </div>
      <h3>{g.title}</h3>
      {g.notes && <p className="g-notes">{g.notes}</p>}
      <div className="meta"><span>{g.start_date} → {g.deadline}</span><span>{finished ? 'Completed 🎉' : daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d late`}</span></div>
      <div>
        <div className="meta"><span>Progress{hasSteps ? ` · ${steps.filter(s => s.done).length}/${steps.length} steps` : ''}</span><b>{p}%</b></div>
        <div className="meter"><i style={{ width: `${p}%` }} /></div>
        <div className="meter time" style={{ marginTop: 5 }}><i style={{ width: `${elapsed}%` }} /></div>
        <small className="g-hint">Orange bar = time used ({elapsed}%)</small>
      </div>
      {!hasSteps && (
        <div className="row">
          <button className="chip" onClick={() => void setProg(Math.max(0, p - 10))}>−10%</button>
          <button className="chip" onClick={() => void setProg(Math.min(100, p + 10))}>+10%</button>
          {!finished && <button className="chip on" onClick={() => void setProg(100)}>Mark done</button>}
          {finished && <button className="chip" onClick={() => void setProg(0)}>Reopen</button>}
        </div>
      )}
      <button className="plain open-steps" onClick={() => setOpen(!open)}>{open ? 'Hide steps ▴' : `Steps (${steps.length}) ▾`}</button>
      {open && (
        <div className="steps">
          {steps.map(s => (
            <label key={s.id} className={s.done ? 'sd' : ''}>
              <input type="checkbox" checked={s.done} onChange={() => void run(() => updateOwned('goal_steps', s.id, { done: !s.done }))} />
              <span>{s.title}</span>
              <button type="button" className="plain" onClick={() => void run(() => removeOwned('goal_steps', s.id))}>✕</button>
            </label>
          ))}
          <form className="step-add" onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; const t = step.trim(); setStep(''); void run(() => saveOwned('goal_steps', { goal_id: g.id, title: t, done: false })); }}>
            <input value={step} onChange={e => setStep(e.target.value)} placeholder="Add a step, e.g. Finish chapter 1" />
            <button className="chip on">Add</button>
          </form>
        </div>
      )}
    </article>
  );
}
