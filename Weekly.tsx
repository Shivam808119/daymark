import { useEffect, useMemo, useState } from 'react';
import { listOwned } from './lib/api';
import { notify } from './lib/notify';
import { isoToday } from './lib/planning';
import type { Expense, Goal, GoalStep, Habit, Reflection, Task } from './lib/types';
import { Title } from './ui';
import { MOODS, goalPct, money, monday, moodOf, parse, shift, shortDate } from './util';

type Log = { book_id: string | null; entry_date: string; pages: number };
type Data = { tasks: Task[]; ref: Reflection[]; habits: Habit[]; exp: Expense[]; log: Log[]; goals: Goal[]; steps: GoalStep[] };

export function Weekly() {
  const today = isoToday();
  const thisWeek = monday(today);
  const [start, setStart] = useState(thisWeek);
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    void Promise.all([
      listOwned<Task>('tasks').catch(() => [] as Task[]),
      listOwned<Reflection>('daily_reflections').catch(() => [] as Reflection[]),
      listOwned<Habit>('daily_habits').catch(() => [] as Habit[]),
      listOwned<Expense>('expenses').catch(() => [] as Expense[]),
      listOwned<Log>('reading_log').catch(() => [] as Log[]),
      listOwned<Goal>('goals').catch(() => [] as Goal[]),
      listOwned<GoalStep>('goal_steps').catch(() => [] as GoalStep[]),
    ]).then(([tasks, ref, habits, exp, log, goals, steps]) => setD({ tasks, ref, habits, exp, log, goals, steps }));
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shift(start, i)), [start]);
  const prevDays = useMemo(() => days.map(x => shift(x, -7)), [days]);

  const s = useMemo(() => {
    if (!d) return null;
    const inW = (x: string) => days.includes(x);
    const tasks = d.tasks.filter(t => t.due_date && inW(t.due_date));
    const done = tasks.filter(t => t.status === 'done');
    const rows = days.map(day => {
      const t = d.tasks.filter(x => x.due_date === day);
      const meals = d.habits.filter(h => h.entry_date === day && h.completed && h.kind !== 'workout').length;
      return {
        day, planned: t.length, done: t.filter(x => x.status === 'done').length,
        diary: d.ref.some(r => r.entry_date === day), workout: d.habits.some(h => h.entry_date === day && h.kind === 'workout' && h.completed),
        meals, spent: d.exp.filter(e => e.spent_on === day).reduce((a, e) => a + Number(e.amount), 0), mood: moodOf(day),
      };
    });
    const expW = d.exp.filter(e => inW(e.spent_on));
    const spent = expW.reduce((a, e) => a + Number(e.amount), 0);
    const prevSpent = d.exp.filter(e => prevDays.includes(e.spent_on)).reduce((a, e) => a + Number(e.amount), 0);
    const cats = new Map<string, number>();
    expW.forEach(e => cats.set(e.category, (cats.get(e.category) ?? 0) + Number(e.amount)));
    const top = [...cats].sort((a, b) => b[1] - a[1]);
    const moods = rows.map(r => r.mood).filter((m): m is number => m !== null);
    const avgMood = moods.length ? Math.round(moods.reduce((a, m) => a + m, 0) / moods.length) : null;
    const best = [...rows].sort((a, b) => b.done - a.done)[0];
    return {
      rows, planned: tasks.length, done: done.length, pct: tasks.length ? Math.round((done.length / tasks.length) * 100) : 0,
      diary: rows.filter(r => r.diary).length, workouts: rows.filter(r => r.workout).length, meals: rows.reduce((a, r) => a + r.meals, 0),
      spent, prevSpent, top, avgMood, best,
      pages: d.log.filter(l => inW(l.entry_date)).reduce((a, l) => a + Number(l.pages), 0),
      goalsDue: d.goals.filter(g => inW(g.deadline)),
    };
  }, [d, days, prevDays]);

  const label = `${shortDate(days[0])} – ${shortDate(days[6])}`;
  const highlights = s ? [
    s.planned ? `You finished ${s.done} of ${s.planned} tasks (${s.pct}%).` : 'No tasks were planned this week.',
    s.best && s.best.done > 0 ? `Most productive day: ${parse(s.best.day).toLocaleDateString(undefined, { weekday: 'long' })} with ${s.best.done} tasks done.` : '',
    `You wrote your diary on ${s.diary} of 7 days and worked out on ${s.workouts}.`,
    s.pages ? `You read ${s.pages} pages.` : '',
    s.spent ? `You spent ${money(s.spent)}${s.top[0] ? `, mostly on ${s.top[0][0]}` : ''}${s.prevSpent ? ` (${s.spent >= s.prevSpent ? 'up' : 'down'} ${Math.round(Math.abs(s.spent - s.prevSpent) / s.prevSpent * 100)}% from last week)` : ''}.` : 'No spending recorded.',
    s.avgMood !== null ? `Average mood: ${MOODS[s.avgMood]?.[0]} ${MOODS[s.avgMood]?.[1]}.` : '',
  ].filter(Boolean) : [];

  async function copy() {
    try { await navigator.clipboard.writeText(`My week (${label})\n` + highlights.map(h => `• ${h}`).join('\n')); notify('Summary copied ✓'); }
    catch { notify('Could not copy on this browser.', 'error'); }
  }

  return (
    <section>
      <Title eyebrow="Weekly summary" title="Your week at a glance." text="Tasks, diary, workouts, reading and spending for the week, on one page." />
      <div className="yearbar">
        <button className="chip" onClick={() => setStart(shift(start, -7))} aria-label="Previous week">‹</button>
        <b style={{ fontSize: 19, minWidth: 170 }}>{start === thisWeek ? 'This week' : label}</b>
        <button className="chip" onClick={() => setStart(shift(start, 7))} disabled={start >= thisWeek} aria-label="Next week">›</button>
        <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => void copy()} disabled={!s}>Copy summary</button>
      </div>
      {start !== thisWeek && <p className="g-hint" style={{ marginTop: -8 }}>{label}</p>}

      {!s ? <p className="empty">Loading your week…</p> : (
        <>
          <div className="stats five">
            <article className="stat"><b>{s.done}/{s.planned}</b><span>tasks done ({s.pct}%)</span></article>
            <article className="stat"><b>{s.diary}/7</b><span>diary days</span></article>
            <article className="stat"><b>{s.workouts}/7</b><span>workout days</span></article>
            <article className="stat"><b>{s.pages}</b><span>pages read</span></article>
            <article className="stat"><b>{money(s.spent)}</b><span>spent</span></article>
          </div>

          <div className="two">
            <article className="panel">
              <h2>Highlights</h2>
              <ul className="hl">{highlights.map(h => <li key={h}>{h}</li>)}</ul>
              {s.goalsDue.length > 0 && (
                <>
                  <p className="kicker" style={{ margin: '16px 0 6px' }}>Goals due this week</p>
                  {d && s.goalsDue.map(g => <div className="dv-task" key={g.id}><span>🎯</span><b>{g.title}</b><em className="prio p-low">{goalPct(g, d.steps)}%</em></div>)}
                </>
              )}
            </article>
            <article className="panel">
              <h2>Spending</h2>
              {s.top.map(([c, v]) => (
                <div className="catrow" key={c}><span>{c}</span><b>{money(v)}</b><div className="meter"><i style={{ width: `${(v / (s.top[0]?.[1] || 1)) * 100}%` }} /></div></div>
              ))}
              {!s.top.length && <p className="empty">Nothing spent this week.</p>}
            </article>
          </div>

          <article className="panel" style={{ marginTop: 22 }}>
            <h2>Day by day</h2>
            <div className="wk-head wk-row"><span>Day</span><span>Tasks</span><span>Diary</span><span>Workout</span><span>Meals</span><span>Spent</span></div>
            {s.rows.map(r => (
              <div className={`wk-row ${r.day === today ? 'now' : ''}`} key={r.day}>
                <span><b>{parse(r.day).toLocaleDateString(undefined, { weekday: 'short' })}</b> {parse(r.day).getDate()}{r.mood !== null ? ` ${MOODS[r.mood]?.[0]}` : ''}</span>
                <span>{r.planned ? `${r.done}/${r.planned}` : '–'}</span>
                <span>{r.diary ? '✓' : '–'}</span>
                <span>{r.workout ? '✓' : '–'}</span>
                <span>{r.meals}/3</span>
                <span>{r.spent ? money(r.spent) : '–'}</span>
              </div>
            ))}
          </article>
        </>
      )}
    </section>
  );
}
