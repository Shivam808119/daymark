import { useEffect, useMemo, useState } from 'react';
import { listOwned } from './lib/api';
import { notify } from './lib/notify';
import { isoToday } from './lib/planning';
import type { Expense, Goal, GoalStep, Reflection } from './lib/types';
import { loadRoutineTemplates, loadScheduleHistory } from './Schedule';
import type { Block, DayRecord, Mode } from './Schedule';
import { Title } from './ui';
import { goalPct, money, monday, parse, shift, shortDate } from './util';

type Log = { book_id: string | null; entry_date: string; pages: number };
type Data = { schedule: DayRecord[]; reflections: Reflection[]; expenses: Expense[]; reading: Log[]; goals: Goal[]; steps: GoalStep[]; templates: Record<Mode, Block[]> };

function duration(block: Block, next?: Block): number {
  const minutes = (clock: string) => { const [h, m] = clock.split(':').map(Number); return h * 60 + m; };
  return Math.max(0, minutes(block.ends ?? next?.starts ?? '23:00') - minutes(block.starts));
}
const hours = (mins: number) => `${Number((mins / 60).toFixed(1))}h`;

export function Weekly() {
  const today = isoToday();
  const currentWeek = monday(today);
  const [start, setStart] = useState(currentWeek);
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void Promise.all([
      loadScheduleHistory(), listOwned<Reflection>('daily_reflections').catch(() => []),
      listOwned<Expense>('expenses').catch(() => []), listOwned<Log>('reading_log').catch(() => []),
      listOwned<Goal>('goals').catch(() => []), listOwned<GoalStep>('goal_steps').catch(() => []), loadRoutineTemplates(),
    ]).then(([schedule, reflections, expenses, reading, goals, steps, templates]) => setData({ schedule, reflections, expenses, reading, goals, steps, templates }));
  }, []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shift(start, i)), [start]);
  const label = `${shortDate(days[0])} – ${shortDate(days[6])}`;
  const summary = useMemo(() => {
    if (!data) return null;
    const rows = days.map(day => {
      const record = data.schedule.find(r => r.entry_date === day);
      const blocks = data.templates[record?.mode ?? 'home'];
      const done = record ? blocks.filter(b => record.completed.includes(b.id)).length : 0;
      const completion = record && blocks.length ? Math.round(100 * done / blocks.length) : 0;
      const sumBlocks = (kind: Block['kind'], checked: boolean) => blocks.reduce((sum, b, i) => sum + (b.kind === kind && b.id !== 'college' && (!checked || record?.completed.includes(b.id)) ? duration(b, blocks[i + 1]) : 0), 0);
      return {
        day, record, done, completion, total: record ? blocks.length : 0,
        fullstack: record ? sumBlocks('stack', true) : 0,
        academics: record ? sumBlocks('study', true) : 0,
        plannedAcademic: record ? sumBlocks('study', false) : 0,
        plannedStack: record ? sumBlocks('stack', false) : 0,
        goals: record?.targets.length ?? 0,
        goalsDone: record?.targets.filter(t => t.done).length ?? 0,
        diary: data.reflections.some(r => r.entry_date === day),
      };
    });
    const tracked = rows.filter(r => r.record);
    const academicMinutes = rows.reduce((sum, r) => sum + r.academics, 0);
    const fullstackMinutes = rows.reduce((sum, r) => sum + r.fullstack, 0);
    const plannedAcademic = rows.reduce((sum, r) => sum + r.plannedAcademic, 0);
    const plannedStack = rows.reduce((sum, r) => sum + r.plannedStack, 0);
    const spent = data.expenses.filter(e => days.includes(e.spent_on)).reduce((sum, r) => sum + Number(r.amount), 0);
    const pages = data.reading.filter(r => days.includes(r.entry_date)).reduce((sum, r) => sum + Number(r.pages), 0);
    return {
      rows, tracked: tracked.length, home: tracked.filter(r => r.record?.mode === 'home').length,
      college: tracked.filter(r => r.record?.mode === 'college').length,
      avg: tracked.length ? Math.round(tracked.reduce((sum, r) => sum + r.completion, 0) / tracked.length) : 0,
      fullstackMinutes, academicMinutes, plannedAcademic, plannedStack, spent, pages,
      goals: rows.reduce((sum, r) => sum + r.goals, 0), goalsDone: rows.reduce((sum, r) => sum + r.goalsDone, 0),
      diary: rows.filter(r => r.diary).length,
      goalsDue: data.goals.filter(g => days.includes(g.deadline)),
    };
  }, [data, days]);

  const highlights = summary ? [
    `You tracked ${summary.tracked} days: ${summary.home} at home and ${summary.college} at college.`,
    `Timetable completion averaged ${summary.avg}% across tracked days.`,
    `Checked study blocks: ${hours(summary.academicMinutes)} of ${hours(summary.plannedAcademic)} planned at home.`,
    `Full-stack: ${hours(summary.fullstackMinutes)} of ${hours(summary.plannedStack)} planned.`,
    `Daily goals completed: ${summary.goalsDone} of ${summary.goals}.`,
    `Reflections written: ${summary.diary} of 7 days.`,
  ] : [];
  async function copy() {
    try { await navigator.clipboard.writeText(`Daymark weekly review (${label})\n${highlights.map(h => `• ${h}`).join('\n')}`); notify('Weekly summary copied ✓'); }
    catch { notify('Could not access clipboard.', 'error'); }
  }
  return <section>
    <Title eyebrow="Weekly review" title="Your progress, in perspective." text="Understand what you planned, what you completed, and how study time balanced with college."/>
    <div className="yearbar"><button className="chip" onClick={() => setStart(shift(start, -7))}>‹</button><b style={{ fontSize: 19 }}>{start === currentWeek ? 'This week' : label}</b><button className="chip" onClick={() => setStart(shift(start, 7))} disabled={start >= currentWeek}>›</button><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => void copy()} disabled={!summary}>Copy review</button></div>
    {!summary ? <p className="empty">Loading your weekly review…</p> : <>
      <div className="stats"><article className="stat"><b>{summary.tracked}/7</b><span>days tracked</span></article><article className="stat"><b>{summary.avg}%</b><span>average completion</span></article><article className="stat"><b>{hours(summary.academicMinutes)}</b><span>checked academic blocks</span></article><article className="stat"><b>{hours(summary.fullstackMinutes)}</b><span>checked full-stack blocks</span></article></div>
      <div className="two"><article className="panel"><h2>Planned vs completed</h2><p className="schedule-help">Hours are counted when you check a study block. These are estimates based on the timetable, not stopwatch measurements.</p>
        {[['Academic self-study', summary.academicMinutes, summary.plannedAcademic], ['Full-stack development', summary.fullstackMinutes, summary.plannedStack]].map(([name, done, total]) => <div className="weekly-focus" key={String(name)}><div className="meta"><b>{name}</b><span>{hours(Number(done))} / {hours(Number(total))}</span></div><div className="meter"><i style={{ width: `${Number(total) ? Math.min(100, Number(done) / Number(total) * 100) : 0}%` }}/></div></div>)}
        <div className="weekly-insight"><b>Daily goals</b><span>{summary.goalsDone} / {summary.goals} done</span></div><div className="weekly-insight"><b>Reflections</b><span>{summary.diary} / 7 days</span></div>
      </article><article className="panel"><h2>Week at a glance</h2><div className="review-week-bars">{summary.rows.map(r => <div className="review-week-day" key={r.day} title={`${r.day}: ${r.completion}%`}><div className="review-week-track"><span style={{ height: `${r.completion}%` }}/></div><small>{parse(r.day).toLocaleDateString(undefined, { weekday: 'short' })}</small><b>{r.record ? `${r.completion}%` : '–'}</b></div>)}</div><p className="schedule-help">{summary.college} college day{summary.college === 1 ? '' : 's'} · {summary.home} home day{summary.home === 1 ? '' : 's'} this week.</p></article></div>
      <article className="panel" style={{ marginTop: 22 }}><h2>Day by day</h2><div className="weekly-day-table"><div className="weekly-day-head"><span>Day</span><span>Type</span><span>Complete</span><span>Study</span><span>Full stack</span><span>Goals</span></div>{summary.rows.map(r => <div className={`weekly-day-row ${r.day === today ? 'current' : ''}`} key={r.day}><b>{shortDate(r.day)}</b><span>{r.record ? r.record.mode === 'college' ? 'College' : 'Home' : '–'}</span><span>{r.record ? `${r.completion}%` : '–'}</span><span>{r.record ? hours(r.academics) : '–'}</span><span>{r.record ? hours(r.fullstack) : '–'}</span><span>{r.goals ? `${r.goalsDone}/${r.goals}` : '–'}</span></div>)}</div></article>
      <div className="two" style={{ marginTop: 22 }}><article className="panel"><h2>Weekly insights</h2><ul className="hl">{highlights.map(h => <li key={h}>{h}</li>)}</ul></article><article className="panel"><h2>Other progress</h2><div className="weekly-insight"><b>Pages read</b><span>{summary.pages}</span></div><div className="weekly-insight"><b>Money spent</b><span>{money(summary.spent)}</span></div>{summary.goalsDue.length > 0 && <><p className="kicker" style={{ marginTop: 20 }}>Goals due this week</p>{summary.goalsDue.map(g => <div className="dv-task" key={g.id}><span>🎯</span><b>{g.title}</b><em className="prio p-low">{goalPct(g, data?.steps ?? [])}%</em></div>)}</>}</article></div>
    </>}
  </section>;
}
