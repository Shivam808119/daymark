import { useEffect, useMemo, useState } from 'react';
import { listOwned } from './lib/api';
import { isoToday } from './lib/planning';
import { supabase } from './lib/supabase';
import type { Goal, GoalStep, Reflection } from './lib/types';
import { loadRoutineTemplates, loadScheduleHistory } from './Schedule';
import type { Block, DayRecord, Mode } from './Schedule';
import { Title } from './ui';
import { daysBetween, download, fmt, goalPct, longDate, parse, shift, shiftMonth } from './util';

type G = Goal & { category?: string | null };
type Templates = Record<Mode, Block[]>;
const progress = (r: DayRecord, templates: Templates) => {
  const list = templates[r.mode].filter(b => b.kind === 'study' || b.kind === 'stack');
  return list.length ? Math.round(list.filter(b => r.completed.includes(b.id)).length / list.length * 100) : 0;
};

function BoardImage({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    setUrl('');
    if (supabase) void supabase.storage.from('vision-boards').createSignedUrl(path, 3600).then(({ data }) => {
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);
  return url ? <img className="vision-preview" src={url} alt="Vision board saved for this date"/> : null;
}

export function Review({ initialDay, onEditDay }: { initialDay: string | null; onEditDay: (date: string) => void }) {
  const [rows, setRows] = useState<DayRecord[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [goals, setGoals] = useState<G[]>([]);
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [templates, setTemplates] = useState<Templates>({ home: [], college: [] });
  const [month, setMonth] = useState(`${isoToday().slice(0, 8)}01`);
  const [selected, setSelected] = useState<string | null>(initialDay);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  useEffect(() => {
    void Promise.all([
      loadScheduleHistory(), listOwned<Reflection>('daily_reflections').catch(() => []),
      listOwned<G>('goals').catch(() => []), listOwned<GoalStep>('goal_steps').catch(() => []),
      loadRoutineTemplates(),
    ]).then(([days, notes, gs, st, routines]) => { setRows(days); setReflections(notes); setGoals(gs); setSteps(st); setTemplates(routines); });
  }, []);
  const byDate = useMemo(() => new Map(rows.map(r => [r.entry_date, r])), [rows]);
  const diaryDates = new Set([...reflections.map(r => r.entry_date), ...rows.map(r => r.entry_date)]);
  const today = isoToday();
  const latest = rows.filter(r => r.entry_date <= today);
  const completed = latest.filter(r => progress(r, templates) === 100).length;
  const avg = latest.length ? Math.round(latest.reduce((a, r) => a + progress(r, templates), 0) / latest.length) : 0;
  const openGoals = goals.filter(g => goalPct(g, steps) < 100 && /^\d{4}-\d{2}-\d{2}$/.test(g.deadline ?? '')).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6);
  const dates = useMemo(() => {
    const all = new Set([...rows.map(r => r.entry_date), ...reflections.map(r => r.entry_date)]);
    return [...all].filter(d => {
      const r = byDate.get(d);
      const note = reflections.find(x => x.entry_date === d);
      return `${d} ${r?.mode ?? ''} ${r?.targets.map(t => t.title).join(' ') ?? ''} ${note?.completed ?? ''} ${note?.learned ?? ''}`.toLowerCase().includes(query.toLowerCase());
    }).sort().reverse();
  }, [rows, reflections, byDate, query]);
  const week = Array.from({ length: 7 }, (_, i) => shift(today, i - 6));

  function exportReflections() {
    const text = ['# Daymark reflections', '', ...reflections.sort((a, b) => b.entry_date.localeCompare(a.entry_date)).flatMap(r => [`## ${r.entry_date}`, `**Planned:** ${r.daily_target ?? ''}`, `**Completed:** ${r.completed ?? ''}`, `**Learned:** ${r.learned ?? ''}`, `**Tomorrow:** ${r.improve_tomorrow ?? ''}`, ''])].join('\n');
    download(`daymark-reflections-${today}.md`, text, 'text/markdown');
  }

  if (selected) {
    const row = byDate.get(selected);
    const notes = reflections.find(r => r.entry_date === selected);
    const blocks = templates[row?.mode ?? 'home'].filter(b => b.kind === 'study' || b.kind === 'stack');
    return <section>
      <div className="dv-bar"><button className="btn ghost" onClick={() => setSelected(null)}>← All days</button><div className="dv-nav"><button className="chip" onClick={() => setSelected(shift(selected, -1))}>‹ Previous</button><button className="chip" onClick={() => setSelected(shift(selected, 1))}>Next ›</button></div>{selected >= today && <button className="btn" onClick={() => onEditDay(selected)}>Edit this day</button>}</div>
      <Title eyebrow="Daily review" title={longDate(selected)} text={row ? `${row.mode === 'college' ? 'College' : 'Home'} day · ${progress(row, templates)}% of timetable complete` : 'No timetable was saved for this day.'}/>
      <div className="stats"><article className="stat"><b>{row ? `${progress(row, templates)}%` : '–'}</b><span>timetable completion</span></article><article className="stat"><b>{row?.targets.filter(t => t.done).length ?? 0}/{row?.targets.length ?? 0}</b><span>goals achieved</span></article><article className="stat"><b>{notes ? '✓' : '–'}</b><span>reflection recorded</span></article></div>
      <div className="two review-day-grid"><article className="panel"><h2>Timetable</h2>{row ? blocks.map(b => <div key={b.id} className={`dv-task ${row.completed.includes(b.id) ? 'done' : ''}`}><span>{row.completed.includes(b.id) ? '✓' : '○'}</span><b>{b.title}<small className="review-time">{b.time}</small></b></div>) : <p className="empty">No timetable recorded. You can select one in Today.</p>}</article>
        <article className="panel"><h2>Daily goals</h2>{row?.targets.map((t, i) => <div className={`dv-task ${t.done ? 'done' : ''}`} key={i}><span>{t.done ? '✓' : '○'}</span><b>{t.title}</b></div>)}{!row?.targets.length && <p className="empty">No goals saved.</p>}<h2 style={{ marginTop: 24 }}>Your reflection</h2>{([['Planned', notes?.daily_target], ['Completed', notes?.completed], ['Learned', notes?.learned], ['Next time', notes?.improve_tomorrow]] as const).filter(([, v]) => Boolean(v?.trim())).map(([label, value]) => <div className="dv-entry" key={label}><small>{label}</small><p>{value}</p></div>)}{!notes && <p className="empty">No reflection yet.</p>}{row?.board_path && <div className="dv-entry"><small>Vision board</small><BoardImage path={row.board_path}/></div>}{row?.board_note && <div className="dv-entry"><small>Vision board note</small><p>{row.board_note}</p></div>}</article></div>
    </section>;
  }

  const first = parse(month);
  const lead = first.getDay();
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: lead + count }, (_, i) => i < lead ? null : fmt(new Date(first.getFullYear(), first.getMonth(), i - lead + 1)));

  return <section>
    <Title eyebrow="Look back" title="Every day tells a story." text="See your home and college days, completed study blocks, reflections and upcoming deadlines."/>
    <div className="stats"><article className="stat"><b>{latest.length}</b><span>days tracked</span></article><article className="stat"><b>{avg}%</b><span>average completion</span></article><article className="stat"><b>{completed}</b><span>fully completed days</span></article><article className="stat"><b>{reflections.length}</b><span>reflections saved</span></article></div>
    <div className="two">
      <article className="panel"><div className="panel-head"><h2>Calendar</h2><label className="jump">Open a date<input type="date" value="" onChange={e => e.target.value && setSelected(e.target.value)}/></label></div>
        <div className="cal"><div className="cal-head"><button className="chip" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><b>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button className="chip" onClick={() => setMonth(shiftMonth(month, 1))}>›</button></div>
          <div className="cal-grid">{['S','M','T','W','T','F','S'].map((x, i) => <small className="dow" key={i}>{x}</small>)}{cells.map((d, i) => {
            if (!d) return <span key={`blank${i}`}/>;
            const day = byDate.get(d);
            const pct = day ? progress(day, templates) : 0;
            return <button key={d} title={`${d}: ${day ? `${day.mode} day, ${pct}% done` : 'Not tracked'}`} className={`cal-day ${pct >= 80 ? 'l3' : pct >= 50 ? 'l2' : pct > 0 ? 'l1' : ''} ${d === today ? 'now' : ''} ${day?.mode === 'college' ? 'cal-college' : ''}`} onClick={() => setSelected(d)}>{parse(d).getDate()}{diaryDates.has(d) && <i/>}{goals.some(g => g.deadline === d) && <u className="flag"/>}</button>;
          })}</div><p className="legend">Green = timetable progress · blue border = college day · dot = saved activity · red marker = deadline</p>
        </div></article>
      <article className="panel"><h2>Recent seven days</h2><div className="review-week-bars">{week.map(d => { const row = byDate.get(d); const pct = row ? progress(row, templates) : 0; return <button className="review-week-day" key={d} onClick={() => setSelected(d)} title={`${d}: ${pct}%`}><div className="review-week-track"><span style={{ height: `${pct}%` }}/></div><small>{parse(d).toLocaleDateString(undefined, { weekday: 'short' })}</small><b>{row ? `${pct}%` : '–'}</b></button>; })}</div><p className="schedule-help">These percentages come from your selected daily timetable, not the old task list.</p></article>
    </div>
    <div className="review-goals-panel panel"><div className="panel-head"><h2>Goal deadlines</h2><span className="g-hint">Upcoming and overdue</span></div>{openGoals.map(g => { const n = daysBetween(today, g.deadline); return <div className="dv-task" key={g.id}><span>🎯</span><b>{g.title}<small className="review-time">{goalPct(g, steps)}% · {longDate(g.deadline)}</small></b><em className={`prio ${n < 0 ? 'p-high' : n <= 7 ? 'p-medium' : 'p-low'}`}>{n < 0 ? `${-n}d overdue` : n === 0 ? 'today' : `${n}d left`}</em></div>; })}{!openGoals.length && <p className="empty">You're all caught up on goal deadlines.</p>}</div>
    <article className="panel"><div className="panel-head"><h2>All days</h2><button className="btn ghost" onClick={exportReflections} disabled={!reflections.length}>Export reflections</button></div><input className="searchbar" placeholder="Search dates, daily goals and reflections…" value={query} onChange={e => setQuery(e.target.value)}/><div className="daylist">{dates.slice(0, limit).map(d => { const row = byDate.get(d); const note = reflections.find(r => r.entry_date === d); return <button className="dayrow" key={d} onClick={() => setSelected(d)}><span className="dr-date"><b>{parse(d).getDate()}</b><small>{parse(d).toLocaleDateString(undefined, { month: 'short', weekday: 'short' })}</small></span><span className="dr-body"><b>{row ? `${row.mode === 'college' ? '🎓 College' : '⌂ Home'} · ${progress(row, templates)}% complete` : 'Reflection day'}</b><small>{note?.learned || note?.completed || row?.targets.map(t => t.title).join(' · ') || 'Open this day'}</small></span><span className="dr-go">Open →</span></button>; })}{!dates.length && <p className="empty">Your days will appear here as you plan and reflect.</p>}</div>{dates.length > limit && <button className="btn ghost" onClick={() => setLimit(x => x + 12)}>Show more</button>}</article>
  </section>;
}
