import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { listOwned, removeOwned, saveOwned, updateOwned, upsertMany } from './lib/api';
import { isoToday } from './lib/planning';
import type { Goal, GoalStep } from './lib/types';
import { Title } from './ui';
import { failure, parse, splitItems } from './util';

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
      const id = crypto.randomUUID();
      const items = splitItems(String(f.get('checklist') ?? ''));
      await saveOwned('goals', { id, title: String(f.get('title')).trim(), notes: String(f.get('notes') ?? ''), category: String(f.get('category')), start_date: start, deadline, priority: 'medium', status: 'active', completion_percentage: 0 });
      await upsertMany('goal_steps', items.map(title => ({ goal_id: id, title, done: false })));
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
          <textarea name="checklist" rows={4} placeholder={'Checklist (optional): one thing per line, each gets a checkbox.\nExample:\nFinish Python\nFinish JavaScript\nBuild a project'} />
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

type Run = (f: () => Promise<unknown>) => Promise<void>;

function GoalCard({ g, steps, p, finished, today, run, remove }: { g: G; steps: GoalStep[]; p: number; finished: boolean; today: number; run: Run; remove: () => void }) {
  const [step, setStep] = useState('');
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [formErr, setFormErr] = useState('');
  const start = parse(g.start_date).getTime();
  const end = parse(g.deadline).getTime();
  const daysLeft = Math.round((end - today) / 86400000);
  const elapsed = useMemo(() => (end > start ? Math.min(100, Math.max(0, Math.round(((today - start) / (end - start)) * 100))) : 100), [start, end, today]);
  const hasSteps = steps.length > 0;
  const fromNotes = splitItems(g.notes ?? '');
  const longNotes = (g.notes ?? '').length > 140;
  const setProg = (v: number) => run(() => updateOwned('goals', g.id, { completion_percentage: v }));

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get('title')).trim();
    const s0 = String(f.get('start'));
    const d0 = String(f.get('deadline'));
    if (!title) { setFormErr('Please write a title.'); return; }
    if (d0 < s0) { setFormErr('The end date must be after the start date.'); return; }
    setFormErr('');
    void run(() => updateOwned('goals', g.id, { title, notes: String(f.get('notes') ?? ''), category: String(f.get('category')), start_date: s0, deadline: d0 })).then(() => setEditing(false));
  }

  if (editing) {
    return (
      <article className="goal">
        <form className="goal-form goal-edit" onSubmit={save}>
          <h3>Edit goal</h3>
          <input name="title" defaultValue={g.title} placeholder="Goal title" required />
          <textarea name="notes" defaultValue={g.notes ?? ''} placeholder="Description (optional)" />
          <div className="gf-row">
            <label>Category<select name="category" defaultValue={g.category ?? 'personal'}>{CATS.map(([c, i]) => <option key={c} value={c}>{i} {c}</option>)}</select></label>
            <label>Start date<input name="start" type="date" defaultValue={g.start_date} required /></label>
            <label>End date<input name="deadline" type="date" defaultValue={g.deadline} required /></label>
          </div>
          {formErr && <small className="error">{formErr}</small>}
          <div className="row">
            <button className="btn">Save changes</button>
            <button type="button" className="btn ghost" onClick={() => { setEditing(false); setFormErr(''); }}>Cancel</button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className={`goal ${finished ? 'fin' : ''}`}>
      <div className="g-top">
        <span className={`badge ${!finished && daysLeft < 0 ? 'late' : ''}`}>{finished ? 'done ✓' : daysLeft < 0 ? 'overdue' : `${icon(g.category)} ${g.category ?? 'goal'}`}</span>
        <span className="g-actions">
          <button className="plain" onClick={() => setEditing(true)} aria-label={`Edit ${g.title}`}>✎ Edit</button>
          <button className="plain" onClick={remove} aria-label={`Delete ${g.title}`}>Delete</button>
        </span>
      </div>
      <h3>{g.title}</h3>
      {g.notes && (
        <div>
          <p className={`g-notes ${longNotes && !more ? 'clamp' : ''}`}>{g.notes}</p>
          {longNotes && <button className="plain more-btn" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Show more'}</button>}
        </div>
      )}
      <div className="meta"><span>{g.start_date} → {g.deadline}</span><span>{finished ? 'Completed 🎉' : daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d late`}</span></div>
      <div>
        <div className="meta"><span>Progress{hasSteps ? ` · ${steps.filter(s => s.done).length}/${steps.length} steps` : ''}</span><b>{p}%</b></div>
        <div className="meter"><i style={{ width: `${p}%` }} /></div>
        <div className="meter time" style={{ marginTop: 5 }}><i style={{ width: `${elapsed}%` }} /></div>
        <small className="g-hint">Orange bar = time used ({elapsed}%)</small>
      </div>
      {!hasSteps && fromNotes.length >= 2 && (
        <button className="btn make-list" onClick={() => void run(() => upsertMany('goal_steps', fromNotes.map(title => ({ goal_id: g.id, title, done: false }))))}>
          ☑ Turn the {fromNotes.length} items in the description into a checklist
        </button>
      )}
      {!hasSteps && (
        <div className="row">
          <button className="chip" onClick={() => void setProg(Math.max(0, p - 10))}>−10%</button>
          <button className="chip" onClick={() => void setProg(Math.min(100, p + 10))}>+10%</button>
          {!finished && <button className="chip on" onClick={() => void setProg(100)}>Mark done</button>}
          {finished && <button className="chip" onClick={() => void setProg(0)}>Reopen</button>}
        </div>
      )}
      <button className="plain open-steps" onClick={() => setOpen(!open)}>{open ? 'Hide checklist ▴' : `Checklist (${steps.filter(x => x.done).length}/${steps.length}) ▾`}</button>
      {open && (
        <div className="steps">
          {steps.map(s => <StepRow key={s.id} s={s} run={run} />)}
          <form className="step-add" onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; const t = step.trim(); setStep(''); void run(() => saveOwned('goal_steps', { goal_id: g.id, title: t, done: false })); }}>
            <input value={step} onChange={e => setStep(e.target.value)} placeholder="Add a step, e.g. Finish chapter 1" />
            <button className="chip on">Add</button>
          </form>
        </div>
      )}
    </article>
  );
}

function StepRow({ s, run }: { s: GoalStep; run: Run }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(s.title);
  if (edit) {
    return (
      <form className="step-edit" onSubmit={e => { e.preventDefault(); const t = text.trim(); if (t && t !== s.title) void run(() => updateOwned('goal_steps', s.id, { title: t })); setEdit(false); }}>
        <input autoFocus value={text} onChange={e => setText(e.target.value)} aria-label="Step name" />
        <button className="chip on">Save</button>
        <button type="button" className="plain" onClick={() => { setText(s.title); setEdit(false); }}>Cancel</button>
      </form>
    );
  }
  return (
    <label className={s.done ? 'sd' : ''}>
      <input type="checkbox" checked={s.done} onChange={() => void run(() => updateOwned('goal_steps', s.id, { done: !s.done }))} />
      <span>{s.title}</span>
      <button type="button" className="plain edit" aria-label={`Edit ${s.title}`} onClick={e => { e.preventDefault(); setText(s.title); setEdit(true); }}>✎</button>
      <button type="button" className="plain" aria-label={`Delete ${s.title}`} onClick={e => { e.preventDefault(); void run(() => removeOwned('goal_steps', s.id)); }}>✕</button>
    </label>
  );
}
