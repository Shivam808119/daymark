import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getReflection, getTasks, listOwned, removeOwned, removeTask, saveOwned, saveReflection, saveTask, updateOwned } from './lib/api';
import { isoToday, taskProgress } from './lib/planning';
import { isConfigured, supabase } from './lib/supabase';
import type { Goal, GoalStep, Reflection, Task } from './lib/types';
import { Backup } from './Backup';
import { Books } from './Books';
import { Expenses } from './Expenses';
import { Goals } from './Goals';
import { HabitsPanel } from './Habits';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { InstallCard } from './Install';
import { Search } from './Search';
import { Title, Toaster } from './ui';
import { Weekly } from './Weekly';
import { WellnessCard } from './Wellness';
import { INTENTIONS, MOODS, bullets, daysBetween, download, failure, fmt, goalPct, greeting, longDate, moodOf, parse, shift, shiftMonth, shortDate, store } from './util';
import type { Page } from './util';

type Theme = 'light' | 'dark';
type Routine = { id: string; title: string; priority: string };

/* ---------- theme ---------- */
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = store.get('daymark-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setTheme = (t: Theme) => {
    store.set('daymark-theme', t);
    setThemeState(t);
  };
  return [theme, setTheme];
}

/* ---------- app shell ---------- */
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(x => setSession(x.data.session));
    const x = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => x.data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="setup">
        <b>DAYMARK</b>
        <h1>Connect your private diary.</h1>
        <p>Add Supabase values to <code>.env</code>, then restart the development server.</p>
      </main>
    );
  }
  return session ? <Layout theme={theme} setTheme={setTheme} /> : <Auth />;
}

function Auth() {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const r = signup
        ? await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
        : await supabase!.auth.signInWithPassword({ email, password });
      if (r.error) throw r.error;
      setMsg(signup ? 'Check your email to confirm your account.' : '');
    } catch (err) {
      setMsg(failure(err));
    }
  }

  return (
    <main className="auth">
      <section>
        <span className="orb">D</span>
        <p className="kicker" style={{ color: '#b9cbbc' }}>DAYMARK</p>
        <h1>Make space<br />for a better day.</h1>
        <blockquote>“Small days become a life.”</blockquote>
        <ul>
          <li>Plan your day and finish what matters</li>
          <li>Write a short diary, keep your streak</li>
          <li>Track goals, books and your mood</li>
        </ul>
      </section>
      <form onSubmit={submit}>
        <p className="kicker">WELCOME</p>
        <h2>{signup ? 'Start your diary' : 'Welcome back'}</h2>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button className="btn">{signup ? 'Create account' : 'Enter Daymark'}</button>
        {msg && <small className="error">{msg}</small>}
        <button className="plain" type="button" onClick={() => setSignup(!signup)} style={{ color: 'var(--muted)' }}>
          {signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
    </main>
  );
}

const SIDE: [Page, IconName, string][] = [['today', 'today', 'Today'], ['goals', 'goals', 'Goals'], ['review', 'review', 'Review'], ['week', 'week', 'Weekly'], ['books', 'books', 'Books'], ['expenses', 'expenses', 'Expenses']];
const TABS: [Page, IconName, string][] = [['today', 'today', 'Today'], ['goals', 'goals', 'Goals'], ['books', 'books', 'Books'], ['expenses', 'expenses', 'Money']];
const MORE: [Page, IconName, string][] = [['review', 'review', 'Review'], ['week', 'week', 'Weekly'], ['settings', 'settings', 'Settings']];
const TITLES: Record<Page, string> = { today: 'Today', goals: 'Goals', review: 'Review', week: 'Weekly summary', books: 'Library', expenses: 'Expenses', settings: 'Settings' };

function Layout({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const [nav, setNav] = useState<{ page: Page; date: string | null }>({ page: 'today', date: null });
  const [more, setMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const { page, date } = nav;
  const go = (p: Page, d: string | null = null) => {
    setNav({ page: p, date: d });
    setMore(false);
    setSearching(false);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching(v => !v); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const signOut = () => void supabase?.auth.signOut();

  return (
    <div className="layout">
      <aside>
        <h2 className="brand"><span className="orb">D</span><span>daymark</span></h2>
        <button className="side-search" onClick={() => setSearching(true)}><Icon n="search" size={17} /><span>Search</span><kbd>Ctrl K</kbd></button>
        <nav>
          {SIDE.map(([id, icon, label]) => (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)}><i><Icon n={icon} size={18} /></i>{label}</button>
          ))}
        </nav>
        <footer>
          <button onClick={toggleTheme}><i><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={18} /></i>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <button className={page === 'settings' ? 'on' : ''} onClick={() => go('settings')}><i><Icon n="settings" size={18} /></i>Settings</button>
          <button onClick={signOut}><i><Icon n="logout" size={18} /></i>Sign out</button>
        </footer>
      </aside>

      <header className="topbar">
        <span className="orb">D</span>
        <b>{TITLES[page]}</b>
        <button onClick={() => setSearching(true)} aria-label="Search"><Icon n="search" size={20} /></button>
        <button onClick={toggleTheme} aria-label="Switch light or dark mode"><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={20} /></button>
      </header>

      <main key={`${page}-${date ?? ''}`}>
        {page === 'today' ? <Today startDate={date ?? isoToday()} onGo={go} />
          : page === 'goals' ? <Goals />
          : page === 'review' ? <Review initialDay={date} onEditDay={d => go('today', d)} />
          : page === 'week' ? <Weekly />
          : page === 'books' ? <Books />
          : page === 'expenses' ? <Expenses />
          : <Settings theme={theme} setTheme={setTheme} />}
      </main>

      <div className="tabbar" role="navigation" aria-label="Main">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)}><Icon n={icon} size={22} /><span>{label}</span></button>
        ))}
        <button className={more || page === 'review' || page === 'week' || page === 'settings' ? 'on' : ''} onClick={() => setMore(!more)}><Icon n="more" size={22} /><span>More</span></button>
      </div>

      {more && (
        <div className="sheet-wrap" onClick={() => setMore(false)}>
          <div className="sheet more-sheet" role="dialog" aria-label="More" onClick={e => e.stopPropagation()}>
            <div className="more-grid">
              {MORE.map(([id, icon, label]) => <button key={id} onClick={() => go(id)}><Icon n={icon} size={24} /><span>{label}</span></button>)}
              <button onClick={() => { setMore(false); setSearching(true); }}><Icon n="search" size={24} /><span>Search</span></button>
              <button onClick={toggleTheme}><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={24} /><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
              <button onClick={signOut}><Icon n="logout" size={24} /><span>Sign out</span></button>
            </div>
          </div>
        </div>
      )}
      {searching && <Search onGo={go} onClose={() => setSearching(false)} />}
      <Toaster />
    </div>
  );
}

/* ---------- streak ---------- */
function computeStreak(dates: string[]) {
  const set = new Set(dates);
  let day = isoToday();
  if (!set.has(day)) day = shift(day, -1); // today not written yet doesn't break the streak
  let n = 0;
  while (set.has(day)) { n += 1; day = shift(day, -1); }
  return n;
}

/* ---------- Today ---------- */
function Today({ startDate, onGo }: { startDate: string; onGo: (p: Page, d?: string | null) => void }) {
  const [date, setDate] = useState(startDate);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [err, setErr] = useState('');
  const [written, setWritten] = useState<string[]>([]);
  const [routine, setRoutine] = useState<Routine[]>([]);
  const [saveRoutine, setSaveRoutine] = useState(false);
  const [showRoutine, setShowRoutine] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [gSteps, setGSteps] = useState<GoalStep[]>([]);
  useEffect(() => {
    void Promise.all([listOwned<Goal>('goals').catch(() => [] as Goal[]), listOwned<GoalStep>('goal_steps').catch(() => [] as GoalStep[])])
      .then(([g, st]) => { setGoals(g); setGSteps(st); });
  }, []);

  const loadRoutine = useCallback(() => {
    listOwned<Routine>('routine_tasks').then(setRoutine).catch(() => undefined);
  }, []);
  useEffect(() => { loadRoutine(); }, [loadRoutine]);

  const load = useCallback(
    () => getTasks(date).then(setTasks).catch(e => setErr(failure(e))),
    [date],
  );
  const loadWritten = useCallback(() => {
    listOwned<Reflection>('daily_reflections').then(r => setWritten(r.map(x => x.entry_date))).catch(() => undefined);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { loadWritten(); }, [loadWritten]);

  const today = isoToday();
  const dueSoon = goals
    .filter(g => goalPct(g, gSteps) < 100 && daysBetween(today, g.deadline) <= 7)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
    .slice(0, 3);
  const stats = taskProgress(tasks);
  const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const streak = useMemo(() => computeStreak(written), [written]);
  const week = useMemo(() => {
    const start = shift(date, -parse(date).getDay());
    return Array.from({ length: 7 }, (_, i) => shift(start, i));
  }, [date]);
  const visible = tasks.filter(t => filter === 'all' || (filter === 'done' ? t.status === 'done' : t.status !== 'done'));
  const pending = tasks.filter(t => t.status !== 'done');
  const intention = INTENTIONS[parse(date).getDate() % INTENTIONS.length];
  const heading = date === today ? `${greeting()}, Shivam.` : date < today ? 'Looking back.' : 'Planning ahead.';
  const R = 34;
  const C = 2 * Math.PI * R;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await saveTask({ title: title.trim(), due_date: date, status: 'todo', priority: priority as Task['priority'], position: tasks.length });
      if (saveRoutine && !routine.some(r => r.title.toLowerCase() === title.trim().toLowerCase())) {
        await saveOwned('routine_tasks', { title: title.trim(), priority });
        loadRoutine();
      }
      setTitle('');
      setSaveRoutine(false);
      await load();
    } catch (error) {
      setErr(failure(error));
    }
  }
  async function addRoutine() {
    try {
      const have = new Set(tasks.map(t => t.title.trim().toLowerCase()));
      let n = tasks.length;
      for (const r of routine) {
        if (have.has(r.title.trim().toLowerCase())) continue;
        await saveTask({ title: r.title, due_date: date, status: 'todo', priority: r.priority as Task['priority'], position: n++ });
      }
      await load();
    } catch (error) {
      setErr(failure(error));
    }
  }
  async function tick(t: Task) {
    try {
      await updateOwned('tasks', t.id, { status: t.status === 'done' ? 'todo' : 'done' });
      await load();
    } catch (error) {
      setErr(failure(error));
    }
  }
  async function carry() {
    try {
      for (const t of pending) await updateOwned('tasks', t.id, { due_date: shift(date, 1) });
      await load();
    } catch (error) {
      setErr(failure(error));
    }
  }

  return (
    <section>
      <header className="hero">
        <div>
          <p className="kicker">{longDate(date)}</p>
          <h1>{heading}</h1>
          <span>{date === today ? 'Choose one meaningful thing, then begin.' : 'Edit tasks and the diary for this day, or pick another date.'}</span>
        </div>
        <div className="hero-side">
          <div className="streak">🔥 <b>{streak}</b> day{streak === 1 ? '' : 's'} diary streak</div>
          <div className="datenav">
            <button onClick={() => setDate(shift(date, -1))} aria-label="Previous day">‹</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value || today)} />
            <button onClick={() => setDate(shift(date, 1))} aria-label="Next day">›</button>
            {date !== today && <button className="today-btn" onClick={() => setDate(today)}>Today</button>}
          </div>
        </div>
      </header>

      {date === today && parse(today).getDay() === 0 && (
        <button className="banner link" onClick={() => onGo('week')}>
          <span>📊</span>
          <div><b>It’s Sunday — your weekly summary is ready</b><small>Tasks, diary, workouts, reading and spending for the week →</small></div>
        </button>
      )}
      {dueSoon.length > 0 && (
        <button className="banner link" onClick={() => onGo('goals')}>
          <span>🎯</span>
          <div>
            <b>{dueSoon.length} goal{dueSoon.length === 1 ? '' : 's'} due soon</b>
            <small>{dueSoon.map(g => { const n = daysBetween(today, g.deadline); return `${g.title} (${n < 0 ? `${-n}d late` : n === 0 ? 'today' : `${n}d left`})`; }).join(' · ')}</small>
          </div>
        </button>
      )}

      <div className="strip">
        {week.map(d => (
          <button key={d} className={`day ${d === date ? 'on' : ''}`} onClick={() => setDate(d)} aria-label={d}>
            <small>{parse(d).toLocaleDateString(undefined, { weekday: 'short' })}</small>
            <b>{parse(d).getDate()}</b>
            {written.includes(d) && d !== date && <i />}
          </button>
        ))}
      </div>

      <div className="today-grid">
        <article className="card">
          <div className="card-head">
            <div>
              <p className="kicker">{date === today ? 'Today’s rhythm' : 'Tasks for this day'}</p>
              <h2>{stats.completed} of {stats.total} complete</h2>
            </div>
            <svg className="ring" width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${pct}% complete`}>
              <circle className="ring-bg" cx="42" cy="42" r={R} strokeWidth="8" />
              <circle className="ring-fg" cx="42" cy="42" r={R} strokeWidth="8" strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} transform="rotate(-90 42 42)" />
              <text x="42" y="47" textAnchor="middle">{pct}%</text>
            </svg>
          </div>
          <div className="progress"><i style={{ width: `${pct}%` }} /></div>

          <form className="add-task" onSubmit={add}>
            <span>+</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What matters most today?" />
            <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priority">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <button>Add</button>
          </form>
          <label className="repeat"><input type="checkbox" checked={saveRoutine} onChange={e => setSaveRoutine(e.target.checked)} /> Save this task to my daily routine</label>
          {err && <small className="error">{err}</small>}

          <div className="routine">
            <button className="chip on" onClick={() => void addRoutine()} disabled={!routine.length}>↻ Add my daily routine ({routine.length})</button>
            <button className="plain" onClick={() => setShowRoutine(!showRoutine)}>{showRoutine ? 'Hide' : 'Manage routine'}</button>
            {showRoutine && (
              <div className="routine-list">
                {routine.map(r => <span key={r.id} className="chip">{r.title}<button aria-label={`Remove ${r.title} from routine`} onClick={() => void removeOwned('routine_tasks', r.id).then(loadRoutine)}>✕</button></span>)}
                {!routine.length && <small>Tick “Save this task to my daily routine” when adding a task, then add them to any day with one click.</small>}
              </div>
            )}
          </div>

          <div className="chips">
            {(['all', 'todo', 'done'] as const).map(f => (
              <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'todo' ? 'To do' : f === 'all' ? 'All' : 'Done'}</button>
            ))}
            {pending.length > 0 && <button className="chip" style={{ marginLeft: 'auto' }} onClick={() => void carry()}>Move {pending.length} unfinished to tomorrow →</button>}
          </div>

          <div className="tasks">
            {visible.map(t => (
              <div className={`task ${t.status === 'done' ? 'complete' : ''}`} key={t.id}>
                <input type="checkbox" checked={t.status === 'done'} onChange={() => void tick(t)} />
                <span>
                  <b>{t.title}</b>
                  <em className={`prio p-${t.priority}`} style={{ fontStyle: 'normal' }}>{t.priority}</em>
                </span>
                <button className="plain" onClick={() => void removeTask(t.id).then(load)}>Remove</button>
              </div>
            ))}
            {!visible.length && <p className="empty">{tasks.length ? 'Nothing in this view.' : 'A clear canvas. Add the one thing that will make today feel good.'}</p>}
          </div>
        </article>

        <div className="side-col">
          <article className="intention">
            <span>✦</span>
            <p className="kicker">Daily intention</p>
            <h3>{intention}</h3>
            <small>Your tasks flow into the diary below, so closing the day takes a minute.</small>
          </article>
          <MoodCard date={date} />
        </div>
      </div>

      <DailyLife date={date} tasks={tasks} onSaved={loadWritten} />
    </section>
  );
}

function MoodCard({ date }: { date: string }) {
  const [mood, setMood] = useState<number | null>(null);
  useEffect(() => { setMood(moodOf(date)); }, [date]);
  function pick(i: number) {
    setMood(i);
    store.set(`daymark-mood-${date}`, String(i));
  }
  return (
    <article className="card">
      <p className="kicker">How are you feeling?</p>
      <div className="mood">
        {MOODS.map(([emoji, label], i) => (
          <button key={label} className={mood === i ? 'on' : ''} onClick={() => pick(i)} title={label} aria-label={label}>{emoji}</button>
        ))}
      </div>
    </article>
  );
}

function DailyLife({ date, tasks, onSaved }: { date: string; tasks: Task[]; onSaved: () => void }) {
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [saved, setSaved] = useState('');
  const [f, setF] = useState({ target: '', done: '', learned: '', next: '' });
  const touched = useRef(false);

  const doneTasks = tasks.filter(t => t.status === 'done');
  const pendingTasks = tasks.filter(t => t.status !== 'done');
  const doneLines = bullets(doneTasks);
  const allLines = bullets(tasks);

  const load = useCallback(async () => {
    try { setReflection(await getReflection(date)); } catch { /* table may not exist yet */ }
  }, [date]);

  useEffect(() => {
    touched.current = false;
    setSaved('');
    setReflection(null);
    void load();
  }, [load]);

  // Fill the form from the saved diary; for fresh days, start from that day's tasks.
  useEffect(() => {
    if (touched.current) return;
    setF({
      target: reflection?.daily_target || allLines,
      done: reflection?.completed || doneLines,
      learned: reflection?.learned ?? '',
      next: reflection?.improve_tomorrow ?? '',
    });
  }, [reflection, allLines, doneLines]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    touched.current = true;
    setF(p => ({ ...p, [k]: e.target.value }));
  };
  function insertTasks() {
    touched.current = true;
    setF(p => ({ ...p, target: allLines, done: doneLines }));
  }
  async function diary(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await saveReflection({ entry_date: date, daily_target: f.target, completed: f.done, learned: f.learned, improve_tomorrow: f.next });
      touched.current = false;
      setSaved('Saved ✓');
      await load();
      onSaved();
    } catch (error) {
      setSaved(failure(error));
    }
  }

  return (
    <div className="daily">
      <WellnessCard date={date} />
      <form onSubmit={diary}>
        <p className="kicker">Daily diary · {shortDate(date)}</p>
        <h2>Close the day clearly.</h2>

        <div className="daytasks">
          <div className="daytasks-head">
            <b>Tasks of the day</b>
            <span>{doneTasks.length} done · {pendingTasks.length} open</span>
            <button type="button" className="chip" onClick={insertTasks} disabled={!tasks.length}>Insert into diary</button>
          </div>
          {tasks.length ? (
            <ul>
              {doneTasks.map(t => <li key={t.id} className="d">✓ {t.title}</li>)}
              {pendingTasks.map(t => <li key={t.id}>○ {t.title}</li>)}
            </ul>
          ) : <small>No tasks for this day yet. Add some above and they will appear here.</small>}
        </div>

        <label className="fld">What did I plan to do?<textarea value={f.target} onChange={set('target')} placeholder="Intentions and planned tasks" /></label>
        <label className="fld">What did I actually complete?<textarea value={f.done} onChange={set('done')} placeholder="Finished tasks and anything extra" /></label>
        <label className="fld">What did I learn?<textarea value={f.learned} onChange={set('learned')} placeholder="One lesson, idea or insight" /></label>
        <label className="fld">What will I improve tomorrow?<textarea value={f.next} onChange={set('next')} placeholder="One small change" /></label>
        <div className="foot"><button className="btn">Save diary</button><span className="ok">{saved}</span></div>
      </form>
    </div>
  );
}

/* ---------- Review ---------- */
function Calendar({ month, setMonth, tasks, written, deadlines, selected, onOpen }: {
  month: string; setMonth: (m: string) => void; tasks: Task[]; written: string[]; deadlines: string[]; selected: string | null; onOpen: (d: string) => void;
}) {
  const first = parse(month);
  const lead = first.getDay();
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = isoToday();
  const cells = Array.from({ length: lead + count }, (_, i) => (i < lead ? null : fmt(new Date(first.getFullYear(), first.getMonth(), i - lead + 1))));
  return (
    <div className="cal">
      <div className="cal-head">
        <button className="chip" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <b>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button className="chip" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
      </div>
      <div className="cal-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <small key={i} className="dow">{d}</small>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const dayTasks = tasks.filter(t => t.due_date === d);
          const done = dayTasks.filter(t => t.status === 'done').length;
          const level = done === 0 ? 0 : done < 3 ? 1 : done < 5 ? 2 : 3;
          return (
            <button key={d} className={`cal-day ${level ? `l${level}` : ''} ${d === today ? 'now' : ''} ${d === selected ? 'sel' : ''}`} onClick={() => onOpen(d)} title={`${d}: ${done}/${dayTasks.length} tasks`}>
              {parse(d).getDate()}
              {written.includes(d) && <i />}
              {deadlines.includes(d) && <u className="flag" title="Goal deadline" />}
            </button>
          );
        })}
      </div>
      <p className="legend"><i /> diary written · <u className="flag" /> goal deadline · darker = more tasks done</p>
    </div>
  );
}

function DayView({ date, tasks, reflections, onOpen, onBack, onEdit }: {
  date: string; tasks: Task[]; reflections: Reflection[]; onOpen: (d: string) => void; onBack: () => void; onEdit: (d: string) => void;
}) {
  const [habits, setHabits] = useState<{ kind: string; completed: boolean; note?: string | null }[]>([]);
  useEffect(() => {
    let live = true;
    void listOwned<{ kind: string; completed: boolean; note?: string | null; entry_date: string }>('daily_habits')
      .catch(() => [])
      .then(r => { if (live) setHabits(r.filter(x => x.entry_date === date && x.completed)); });
    return () => { live = false; };
  }, [date]);

  const day = tasks.filter(t => t.due_date === date).sort((a, b) => a.position - b.position);
  const done = day.filter(t => t.status === 'done');
  const open = day.filter(t => t.status !== 'done');
  const r = reflections.find(x => x.entry_date === date);
  const mood = moodOf(date);
  const pct = day.length ? Math.round((done.length / day.length) * 100) : 0;
  const entries: [string, string | null | undefined][] = [
    ['What I planned', r?.daily_target],
    ['What I completed', r?.completed],
    ['What I learned', r?.learned],
    ['To improve tomorrow', r?.improve_tomorrow],
  ];
  const hasDiary = entries.some(([, v]) => v && v.trim());

  return (
    <section>
      <div className="dv-bar">
        <button className="btn ghost" onClick={onBack}>← All days</button>
        <div className="dv-nav">
          <button className="chip" onClick={() => onOpen(shift(date, -1))}>‹ Previous day</button>
          <button className="chip" onClick={() => onOpen(shift(date, 1))}>Next day ›</button>
        </div>
        <button className="btn" onClick={() => onEdit(date)}>Edit this day</button>
      </div>

      <header className="title" style={{ marginBottom: 18 }}>
        <div>
          <p className="kicker">Diary of</p>
          <h1>{longDate(date)}</h1>
        </div>
      </header>

      <div className="stats">
        <article className="stat"><b>{done.length}/{day.length}</b><span>tasks finished ({pct}%)</span></article>
        <article className="stat"><b>{mood === null ? '–' : MOODS[mood]?.[0]}</b><span>{mood === null ? 'no mood saved' : `felt ${MOODS[mood]?.[1].toLowerCase()}`}</span></article>
        <article className="stat"><b>{habits.length}/4</b><span>workout &amp; meals done</span></article>
        <article className="stat"><b>{hasDiary ? '✓' : '–'}</b><span>{hasDiary ? 'diary written' : 'no diary yet'}</span></article>
      </div>

      <div className="two">
        <article className="panel">
          <h2>Tasks that day</h2>
          {done.length > 0 && <p className="kicker" style={{ margin: '16px 0 6px' }}>Completed</p>}
          {done.map(t => <div className="dv-task done" key={t.id}><span>✓</span><b>{t.title}</b><em className={`prio p-${t.priority}`}>{t.priority}</em></div>)}
          {open.length > 0 && <p className="kicker" style={{ margin: '16px 0 6px' }}>Not finished</p>}
          {open.map(t => <div className="dv-task" key={t.id}><span>○</span><b>{t.title}</b><em className={`prio p-${t.priority}`}>{t.priority}</em></div>)}
          {!day.length && <p className="empty">No tasks were planned for this day.</p>}
        </article>

        <article className="panel">
          <h2>What I wrote</h2>
          {hasDiary ? entries.filter(([, v]) => v && v.trim()).map(([label, v]) => (
            <div className="dv-entry" key={label}>
              <small>{label}</small>
              <p>{v}</p>
            </div>
          )) : (
            <>
              <p className="empty">No diary was written for this day.</p>
              <button className="btn" onClick={() => onEdit(date)}>Write this day</button>
            </>
          )}
          {habits.length > 0 && (
            <div className="dv-entry">
              <small>Workout &amp; meals</small>
              <p>{habits.map(h => (h.kind === 'workout' && h.note ? `workout (${h.note})` : h.kind)).join(' · ')}</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function Review({ initialDay, onEditDay }: { initialDay: string | null; onEditDay: (d: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ref, setRef] = useState<Reflection[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(initialDay);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [gSteps, setGSteps] = useState<GoalStep[]>([]);
  const [month, setMonth] = useState(() => `${isoToday().slice(0, 8)}01`);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    void Promise.all([
      listOwned<Task>('tasks'), listOwned<Reflection>('daily_reflections'),
      listOwned<Goal>('goals').catch(() => [] as Goal[]), listOwned<GoalStep>('goal_steps').catch(() => [] as GoalStep[]),
    ])
      .then(([t, r, g, st]) => { setTasks(t); setRef(r); setGoals(g); setGSteps(st); })
      .catch(() => undefined);
  }, []);

  const done = tasks.filter(x => x.status === 'done').length;
  const writtenDates = useMemo(() => ref.map(x => x.entry_date), [ref]);
  const streak = computeStreak(writtenDates);
  const today = isoToday();
  const upcoming = goals
    .filter(g => goalPct(g, gSteps) < 100)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
    .slice(0, 5);
  const last7 = Array.from({ length: 7 }, (_, i) => shift(today, i - 6));
  const missed = last7.filter(d => !writtenDates.includes(d)).reverse();
  const bars = last7.map(d => {
    const day = tasks.filter(t => t.due_date === d);
    return { d, total: day.length, completed: day.filter(t => t.status === 'done').length };
  });
  const maxBar = Math.max(1, ...bars.map(b => b.total));

  const days = useMemo(() => {
    const set = new Set<string>(writtenDates);
    tasks.forEach(t => { if (t.due_date) set.add(t.due_date); });
    const needle = q.trim().toLowerCase();
    return [...set]
      .filter(d => {
        if (!needle) return true;
        const r = ref.find(x => x.entry_date === d);
        const hay = [d, r?.completed, r?.learned, r?.daily_target, r?.improve_tomorrow, ...tasks.filter(t => t.due_date === d).map(t => t.title)];
        return hay.some(v => (v ?? '').toLowerCase().includes(needle));
      })
      .sort((a, b) => (a < b ? 1 : -1));
  }, [writtenDates, tasks, ref, q]);

  function exportDiary() {
    const md = ['# My Daymark diary', '']
      .concat(
        [...ref].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)).flatMap(x => {
          const dt = tasks.filter(t => t.due_date === x.entry_date);
          return [
            `## ${x.entry_date}`,
            ...dt.map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`),
            `**Planned:** ${x.daily_target ?? ''}`,
            `**Completed:** ${x.completed ?? ''}`,
            `**Learned:** ${x.learned ?? ''}`,
            `**Tomorrow:** ${x.improve_tomorrow ?? ''}`,
            '',
          ];
        }),
      )
      .join('\n');
    download(`daymark-diary-${today}.md`, md, 'text/markdown');
  }

  if (open) {
    return <DayView date={open} tasks={tasks} reflections={ref} onOpen={setOpen} onBack={() => setOpen(null)} onEdit={onEditDay} />;
  }

  return (
    <section>
      <Title eyebrow="Look back" title="Your days leave a trail." text="Open any day to see its tasks, what you did and what you wrote." />
      <div className="stats">
        <article className="stat"><b>{done}</b><span>tasks completed</span></article>
        <article className="stat"><b>{tasks.length}</b><span>tasks planned</span></article>
        <article className="stat"><b>{ref.length}</b><span>diary days saved</span></article>
        <article className="stat"><b>{streak}</b><span>day streak 🔥</span></article>
      </div>

      <div className="two">
        <article className="panel">
          <div className="panel-head">
            <h2>Calendar</h2>
            <label className="jump">Open a date<input type="date" max={today} onChange={e => e.target.value && setOpen(e.target.value)} /></label>
          </div>
          <Calendar month={month} setMonth={setMonth} tasks={tasks} written={writtenDates} deadlines={goals.map(g => g.deadline)} selected={null} onOpen={setOpen} />
        </article>
        <article className="panel">
          <h2>This week</h2>
          <div className="bars">
            {bars.map(b => (
              <button className="bar" key={b.d} title={`${b.completed}/${b.total} done`} onClick={() => setOpen(b.d)}>
                <div className="bar-track" style={{ height: '100%', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                  <div className="bar-total" style={{ height: `${Math.max(4, (b.total / maxBar) * 100)}%`, maxWidth: 44 }}>
                    <b style={{ height: b.total ? `${(b.completed / b.total) * 100}%` : 0 }} />
                  </div>
                </div>
                <small>{parse(b.d).toLocaleDateString(undefined, { weekday: 'short' })}</small>
              </button>
            ))}
          </div>
          <div className="intention" style={{ marginTop: 18, padding: 18, boxShadow: 'none' }}>
            <p className="kicker">Missed diary</p>
            <h3 style={{ fontSize: 22, margin: '4px 0 8px' }}>{missed.length} day{missed.length === 1 ? '' : 's'} to revisit</h3>
            <div className="chips" style={{ margin: 0 }}>
              {missed.slice(0, 4).map(d => <button key={d} className="chip" onClick={() => setOpen(d)}>{shortDate(d)}</button>)}
              {!missed.length && <small>Your last seven days are all written.</small>}
            </div>
          </div>
        </article>
      </div>

      <div className="two" style={{ marginBottom: 22 }}>
        <HabitsPanel />
        <article className="panel">
          <h2>Goal deadlines</h2>
          {upcoming.map(g => {
            const n = daysBetween(today, g.deadline);
            return (
              <div className="dv-task" key={g.id}>
                <span>🎯</span>
                <b>{g.title}<small style={{ display: 'block', color: 'var(--muted)', fontWeight: 400 }}>{goalPct(g, gSteps)}% done · {longDate(g.deadline)}</small></b>
                <em className={`prio ${n < 0 ? 'p-high' : n <= 7 ? 'p-medium' : 'p-low'}`}>{n < 0 ? `${-n}d late` : n === 0 ? 'today' : `${n}d`}</em>
              </div>
            );
          })}
          {!upcoming.length && <p className="empty">No open goals. Add one in Goals.</p>}
        </article>
      </div>

      <article className="panel">
        <div className="panel-head">
          <h2>All days</h2>
          <button className="btn ghost" onClick={exportDiary} disabled={!ref.length}>Export .md</button>
        </div>
        <input className="searchbar" style={{ marginTop: 14 }} placeholder="Search tasks and diary…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="daylist">
          {days.slice(0, limit).map(d => {
            const r = ref.find(x => x.entry_date === d);
            const dt = tasks.filter(t => t.due_date === d);
            const dn = dt.filter(t => t.status === 'done').length;
            const m = moodOf(d);
            const snippet = r?.completed || r?.learned || r?.daily_target || '';
            return (
              <button className="dayrow" key={d} onClick={() => setOpen(d)}>
                <span className="dr-date"><b>{parse(d).getDate()}</b><small>{parse(d).toLocaleDateString(undefined, { month: 'short', weekday: 'short' })}</small></span>
                <span className="dr-body">
                  <b>{dt.length ? `${dn}/${dt.length} tasks done` : 'No tasks'}{m !== null ? ` · ${MOODS[m]?.[0]}` : ''}</b>
                  <small>{snippet ? snippet.replace(/\n/g, ' ') : r ? 'Diary saved' : 'No diary written'}</small>
                </span>
                <span className="dr-go">Open →</span>
              </button>
            );
          })}
          {!days.length && <p className="empty">{ref.length || tasks.length ? 'No days match your search.' : 'Your days will appear here as you plan and write.'}</p>}
        </div>
        {days.length > limit && <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setLimit(limit + 15)}>Show more days</button>}
      </article>
    </section>
  );
}

/* ---------- Settings ---------- */
function Settings({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <section>
      <Title eyebrow="Daymark" title="Settings" text="Make Daymark feel like yours." />
      <div className="settings">
        <article className="setting">
          <div><h3>Appearance</h3><p>Switch between a light and a dark theme.</p></div>
          <div className="seg">
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </article>
        <InstallCard />
        <Backup />
      </div>
    </section>
  );
}
