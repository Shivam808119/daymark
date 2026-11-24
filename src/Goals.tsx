import { FormEvent, useCallback, useEffect, useState } from 'react';
import { listOwned, removeOwned, saveOwned, updateOwned, upsertMany } from './lib/api';
import { isoToday } from './lib/planning';
import type { Goal, GoalStep } from './lib/types';
import { Title } from './ui';
import { failure, parse, splitItems } from './util';

type G = Goal & { category?: string | null; notes?: string | null };
const CATS: [string, string][] = [['personal', '🌱'], ['study', '📚'], ['health', '💪'], ['career', '💼'], ['money', '💰'], ['skill', '🛠']];
const emoji = (c?: string | null) => CATS.find(x => x[0] === c)?.[1] ?? '🎯';
const validDate = (date: string | null | undefined, fallback: string) => /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : fallback;
const percentage = (g: G, all: GoalStep[]) => {
  const steps = all.filter(s => s.goal_id === g.id);
  return steps.length ? Math.round(steps.filter(s => s.done).length / steps.length * 100) : Math.min(100, Math.max(0, Number(g.completion_percentage ?? 0)));
};
const dateLabel = (date?: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline';

export function Goals() {
  const [year, setYear] = useState(parse(isoToday()).getFullYear());
  const [goals, setGoals] = useState<G[]>([]);
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [newStep, setNewStep] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try {
      const [g, s] = await Promise.all([listOwned<G>('goals'), listOwned<GoalStep>('goal_steps').catch(() => [])]);
      setGoals(g.sort((a, b) => validDate(a.deadline, '9999-12-31').localeCompare(validDate(b.deadline, '9999-12-31'))));
      setSteps(s);
      setMsg('');
    } catch (err) { setMsg(failure(err)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const yearGoals = goals.filter(g => validDate(g.start_date, `${year}-01-01`) <= `${year}-12-31` && validDate(g.deadline, `${year}-12-31`) >= `${year}-01-01`);
  const completed = (g: G) => g.status === 'completed' || percentage(g, steps) >= 100;
  const filtered = yearGoals.filter(g => {
    if (cat !== 'all' && g.category !== cat) return false;
    if (!`${g.title} ${g.notes ?? ''} ${steps.filter(s => s.goal_id === g.id).map(s => s.title).join(' ')}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (status === 'completed') return completed(g);
    if (status === 'active') return !completed(g) && (g.status === 'active' || !g.status);
    if (status !== 'all') return g.status === status;
    return true;
  });
  const focused = filtered.find(g => g.id === selected) ?? filtered[0];
  const focusSteps = focused ? steps.filter(s => s.goal_id === focused.id) : [];
  const focusProgress = focused ? percentage(focused, steps) : 0;
  const today = isoToday();
  const active = yearGoals.filter(g => !completed(g) && g.status !== 'archived' && g.status !== 'paused');
  const achieved = yearGoals.filter(completed).length;
  const upcoming = active.filter(g => g.deadline && g.deadline >= today && g.deadline <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;
  const overdue = active.filter(g => g.deadline && g.deadline < today).length;
  const average = yearGoals.length ? Math.round(yearGoals.reduce((sum, g) => sum + percentage(g, steps), 0) / yearGoals.length) : 0;
  const nextStep = focusSteps.find(s => !s.done);
  const remainingDays = focused?.deadline ? Math.round((parse(focused.deadline).getTime() - parse(today).getTime()) / 86400000) : null;
  async function run(action: () => Promise<unknown>) { try { await action(); await load(); } catch (err) { setMsg(failure(err)); } }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const start = String(f.get('start'));
    const deadline = String(f.get('deadline'));
    if (deadline < start) { setMsg('Choose an end date after the start date.'); return; }
    const id = crypto.randomUUID();
    await run(async () => {
      await saveOwned('goals', { id, title: String(f.get('title')).trim(), category: String(f.get('category')), notes: String(f.get('notes') ?? ''), start_date: start, deadline, priority: 'medium', status: 'active', completion_percentage: 0 });
      await upsertMany('goal_steps', splitItems(String(f.get('checklist') ?? '')).map(title => ({ goal_id: id, title, done: false })));
      form.reset(); setSelected(id); setStatus('active'); setCat('all'); setAdding(false);
    });
  }
  function remove(g: G) {
    if (window.confirm(`Delete “${g.title}” and its milestones permanently?`)) void run(async () => { await removeOwned('goals', g.id); setSelected(null); });
  }
  return <section className="goals-page">
    <Title eyebrow="Your personal roadmap" title="Build a life you're proud of." text="Big dreams become real through the next small step. Pick a goal and move it forward." />
    <div className="yearbar">
      <button className="chip" onClick={() => setYear(y => y - 1)}>‹ Previous</button>
      <b>{year} ROADMAP</b>
      <button className="chip" onClick={() => setYear(y => y + 1)}>Next ›</button>
      <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setAdding(v => !v)}>{adding ? 'Close' : '+ Create a goal'}</button>
    </div>
    <div className="goal-hero">
      <div><span className="goal-hero-kicker">YOUR YEAR, IN MOTION</span><h2>Progress is built<br/>one step at a time<span className="goal-hero-dot">.</span></h2><p>{achieved ? `${achieved} goal${achieved === 1 ? '' : 's'} completed. Keep the momentum going.` : 'Every milestone you check is a promise kept to yourself.'}</p></div>
      <div className="goal-hero-ring" style={{ background: `conic-gradient(#77d3a6 ${average}%, rgba(255,255,255,.12) 0)` }}><div><strong>{average}%</strong><small>overall progress</small></div></div>
    </div>
    <div className="goal-metrics">
      <div><b>{active.length}</b><span>In progress</span></div><div><b>{achieved}</b><span>Completed</span></div><div><b>{upcoming}</b><span>Due this week</span></div><div><b className={overdue ? 'goal-warn' : ''}>{overdue}</b><span>Need attention</span></div>
    </div>
    {adding && <form className="panel goal-form goal-create" onSubmit={add}>
      <div><span className="goal-overline">START SOMETHING MEANINGFUL</span><h2>What would make you proud?</h2></div>
      <input name="title" placeholder="Name your goal, e.g. Build my first full-stack app" required maxLength={150}/>
      <textarea name="notes" placeholder="Why does this matter to you? (optional)" rows={3}/>
      <textarea name="checklist" rows={4} placeholder={'Break it into milestones, one per line (optional)\nLearn React\nBuild the app\nPublish it'}/>
      <div className="gf-row"><label>Category<select name="category">{CATS.map(([name, symbol]) => <option key={name} value={name}>{symbol} {name}</option>)}</select></label><label>Start<input type="date" name="start" defaultValue={today} required/></label><label>Target date<input type="date" name="deadline" defaultValue={`${year}-12-31`} required/></label></div>
      <button className="btn">Create my goal →</button>
    </form>}
    {msg && <p className="error" role="alert">{msg}</p>}
    <div className="goal-workspace-heading"><div><span className="goal-overline">YOUR FOCUS</span><h2>The goal studio</h2><p>Keep the big picture clear. Focus on one goal at a time.</p></div><span className="goal-counter">{filtered.length} showing</span></div>
    <div className="goal-filters">
      <input className="searchbar" aria-label="Search goals" placeholder="⌕  Find a goal or milestone…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="chips">{[['active', 'In progress'], ['all', 'All'], ['completed', 'Finished'], ['paused', 'Paused'], ['archived', 'Archived']].map(([key, label]) => <button className={`chip ${status === key ? 'on' : ''}`} onClick={() => setStatus(key)} key={key}>{label}</button>)}</div>
      <div className="chips">{['all', ...CATS.map(x => x[0])].map(c => <button key={c} className={`chip cap ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c === 'all' ? 'All types' : `${emoji(c)} ${c}`}</button>)}</div>
    </div>
    <div className="goal-workspace">
      <div className="goal-rail" aria-label="Goal list">
        {filtered.map(g => {
          const p = percentage(g, steps);
          const related = steps.filter(s => s.goal_id === g.id);
          return <button key={g.id} className={`goal-rail-item ${focused?.id === g.id ? 'selected' : ''}`} onClick={() => { setSelected(g.id); setNewStep(''); setNotesOpen(false); }}>
            <span className="goal-rail-top"><span className="goal-category">{emoji(g.category)} {g.category ?? 'personal'}</span><strong>{p}%</strong></span>
            <span className="goal-rail-title">{g.title}</span>
            <span className="goal-rail-bottom">{related.length ? `${related.filter(s => s.done).length} of ${related.length} milestones` : 'Create your first milestone'}<span>{completed(g) ? '✓ Done' : g.deadline && g.deadline < today ? 'Overdue' : dateLabel(g.deadline)}</span></span>
            <span className="goal-rail-meter"><i style={{ width: `${p}%` }}/></span>
          </button>;
        })}
        {!filtered.length && <div className="goal-rail-empty"><span>✧</span><h3>Room for something new</h3><p>{yearGoals.length ? 'Try another filter, or search for a different goal.' : `Your ${year} roadmap is ready for your first goal.`}</p><button className="chip on" onClick={() => { setStatus('all'); setCat('all'); setQuery(''); setAdding(true); }}>+ Add a goal</button></div>}
      </div>
      {focused && <article className="goal-focus" key={focused.id}>
        <div className="goal-focus-header"><span className="goal-overline">FOCUS MODE · {emoji(focused.category)} {(focused.category ?? 'personal').toUpperCase()}</span><span className={`goal-focus-status ${completed(focused) ? 'is-done' : ''}`}>{completed(focused) ? '✓ Achieved' : focused.status === 'paused' ? 'Paused' : focused.status === 'archived' ? 'Archived' : remainingDays !== null && remainingDays < 0 ? 'Needs attention' : 'In progress'}</span></div>
        <h2>{focused.title}</h2>
        <div className="goal-focus-progress"><div className="goal-focus-number"><strong>{focusProgress}%</strong><span>complete</span></div><div className="goal-focus-progress-body"><div className="goal-progress-track"><i style={{ width: `${focusProgress}%` }}/></div><p>{focusSteps.length ? `${focusSteps.filter(s => s.done).length} / ${focusSteps.length} steps completed` : 'Add milestones to see automatic progress'}</p><small>{dateLabel(focused.start_date)} – {dateLabel(focused.deadline)}{remainingDays !== null && !completed(focused) ? ` · ${remainingDays >= 0 ? `${remainingDays} days to go` : `${-remainingDays} days overdue`}` : ''}</small></div></div>
        {!completed(focused) && nextStep && <div className="goal-next"><span>✦ YOUR NEXT MOVE</span><p>{nextStep.title}</p><button className="btn" onClick={() => void run(() => updateOwned('goal_steps', nextStep.id, { done: true }))}>Mark done ✓</button></div>}
        {focused.notes && <div className="goal-focus-notes"><button className="plain" onClick={() => setNotesOpen(v => !v)}>{notesOpen ? '▴ Hide your vision' : '▾ Read your vision & notes'}</button>{notesOpen && <p>{focused.notes}</p>}</div>}
        <div className="goal-milestone-heading"><div><h3>Your milestones</h3><p>Turn each small action into a win.</p></div><b>{focusSteps.filter(s => s.done).length} / {focusSteps.length}</b></div>
        <div className="goal-milestone-list">
          {focusSteps.map((s, index) => <label className={`goal-milestone ${s.done ? 'checked' : ''}`} key={s.id}><input type="checkbox" checked={s.done} onChange={() => void run(() => updateOwned('goal_steps', s.id, { done: !s.done }))}/><span className="goal-milestone-index">{String(index + 1).padStart(2, '0')}</span><span className="goal-milestone-name">{s.title}</span><button type="button" className="plain goal-milestone-remove" aria-label={`Delete milestone ${s.title}`} onClick={e => { e.preventDefault(); void run(() => removeOwned('goal_steps', s.id)); }}>×</button></label>)}
          {!focusSteps.length && <p className="goal-milestone-empty">Your path starts here. Add your first practical step below.</p>}
        </div>
        <form className="goal-milestone-add" onSubmit={e => { e.preventDefault(); if (!newStep.trim()) return; const title = newStep.trim(); setNewStep(''); void run(() => saveOwned('goal_steps', { goal_id: focused.id, title, done: false })); }}><input value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="What's the next small step?"/><button className="btn" disabled={!newStep.trim()}>+ Add step</button></form>
        {!focusSteps.length && splitItems(focused.notes ?? '').length >= 2 && <button className="chip" onClick={() => void run(() => upsertMany('goal_steps', splitItems(focused.notes ?? '').map(title => ({ goal_id: focused.id, title, done: false }))))}>Turn notes into a checklist</button>}
        {!focusSteps.length && <div className="goal-manual"><span>Or set progress manually</span><button className="chip" onClick={() => void run(() => updateOwned('goals', focused.id, { completion_percentage: Math.max(0, focusProgress - 10) }))}>−10%</button><button className="chip" onClick={() => void run(() => updateOwned('goals', focused.id, { completion_percentage: Math.min(100, focusProgress + 10) }))}>+10%</button></div>}
        <div className="goal-focus-footer"><button className="chip" onClick={() => void run(() => updateOwned('goals', focused.id, { status: focused.status === 'paused' ? 'active' : 'paused' }))}>{focused.status === 'paused' ? '▶ Resume' : 'Ⅱ Pause'}</button><button className="chip" onClick={() => void run(() => updateOwned('goals', focused.id, { status: focused.status === 'archived' ? 'active' : 'archived' }))}>{focused.status === 'archived' ? '↺ Restore' : 'Archive'}</button>{!completed(focused) && <button className="chip on" onClick={() => void run(() => updateOwned('goals', focused.id, { status: 'completed', completion_percentage: 100 }))}>✓ Finish goal</button>}<button className="plain goal-delete" onClick={() => remove(focused)}>Delete goal</button></div>
      </article>}
    </div>
  </section>;
}
