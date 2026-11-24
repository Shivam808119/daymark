import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getReflection, saveReflection } from './lib/api';
import { isoToday } from './lib/planning';
import { isConfigured, supabase } from './lib/supabase';
import type { Reflection } from './lib/types';
import { Backup } from './Backup';
import { Books } from './Books';
import { Expenses } from './Expenses';
import { Goals } from './Goals';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { InstallCard } from './Install';
import { Review } from './Review';
import { Schedule, loadScheduleHistory, setScheduleUser, useScheduleReminders } from './Schedule';
import { Search } from './Search';
import { Title, Toaster } from './ui';
import { Weekly } from './Weekly';
import { VisionBoard } from './VisionBoard';
import { INTENTIONS, failure, greeting, longDate, parse, shift, shortDate, store } from './util';
import type { Page } from './util';

type Theme = 'light' | 'dark';

function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = store.get('daymark-theme');
    return saved === 'dark' || saved === 'light' ? saved : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return [theme, t => { store.set('daymark-theme', t); setThemeState(t); }];
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(r => setSession(r.data.session));
    const sub = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.data.subscription.unsubscribe();
  }, []);
  if (!isConfigured) return <main className="setup"><b>DAYMARK</b><h1>Connect your private diary.</h1><p>Add Supabase values to <code>.env</code>, then restart the development server.</p></main>;
  return session ? <Layout userId={session.user.id} theme={theme} setTheme={setTheme} /> : <Auth />;
}

function Auth() {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const result = signup
        ? await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
        : await supabase!.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setMessage(signup ? 'Check your email to confirm your account.' : '');
    } catch (err) { setMessage(failure(err)); }
  }
  return <main className="auth"><section><span className="orb">D</span><p className="kicker" style={{ color: '#b9cbbc' }}>DAYMARK</p><h1>Make space<br/>for a better day.</h1><blockquote>“Small days become a life.”</blockquote><ul><li>Follow your daily study timetable</li><li>Track goals and reflect on your progress</li><li>Keep your books, notes and money organized</li></ul></section>
    <form onSubmit={submit}><p className="kicker">WELCOME</p><h2>{signup ? 'Start your diary' : 'Welcome back'}</h2><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="btn">{signup ? 'Create account' : 'Enter Daymark'}</button>{message && <small className="error">{message}</small>}<button className="plain" type="button" onClick={() => setSignup(!signup)}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></form>
  </main>;
}

const SIDE: [Page, IconName, string][] = [['today', 'today', 'Today'], ['goals', 'goals', 'Goals'], ['review', 'review', 'Review'], ['week', 'week', 'Weekly'], ['books', 'books', 'Books'], ['expenses', 'expenses', 'Expenses']];
const TABS: [Page, IconName, string][] = [['today', 'today', 'Today'], ['goals', 'goals', 'Goals'], ['books', 'books', 'Books'], ['expenses', 'expenses', 'Money']];
const MORE: [Page, IconName, string][] = [['review', 'review', 'Review'], ['week', 'week', 'Weekly'], ['settings', 'settings', 'Settings']];
const TITLES: Record<Page, string> = { today: 'Today', schedule: 'Today', goals: 'Goals', review: 'Review', week: 'Weekly summary', books: 'Library', expenses: 'Expenses', settings: 'Settings' };

function Layout({ userId, theme, setTheme }: { userId: string; theme: Theme; setTheme: (t: Theme) => void }) {
  setScheduleUser(userId);
  useScheduleReminders();
  const [nav, setNav] = useState<{ page: Page; date: string | null }>({ page: 'today', date: null });
  const [more, setMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const page = nav.page;
  const go = (p: Page, date: string | null = null) => { setNav({ page: p, date }); setMore(false); setSearching(false); window.scrollTo({ top: 0 }); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching(v => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  return <div className="layout">
    <aside><h2 className="brand"><span className="orb">D</span><span>daymark</span></h2><button className="side-search" onClick={() => setSearching(true)}><Icon n="search" size={17}/><span>Search</span><kbd>Ctrl K</kbd></button><nav>{SIDE.map(([id, icon, label]) => <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)}><i><Icon n={icon} size={18}/></i>{label}</button>)}</nav>
      <footer><button onClick={toggleTheme}><i><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={18}/></i>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button><button className={page === 'settings' ? 'on' : ''} onClick={() => go('settings')}><i><Icon n="settings" size={18}/></i>Settings</button><button onClick={() => void supabase?.auth.signOut()}><i><Icon n="logout" size={18}/></i>Sign out</button></footer></aside>
    <header className="topbar"><span className="orb">D</span><b>{TITLES[page]}</b><button onClick={() => setSearching(true)} aria-label="Search"><Icon n="search" size={20}/></button><button onClick={toggleTheme} aria-label="Switch theme"><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={20}/></button></header>
    <main key={`${page}-${nav.date ?? ''}`}>
      {page === 'today' || page === 'schedule' ? <Today startDate={nav.date ?? isoToday()} onGo={go}/>
        : page === 'goals' ? <Goals/>
        : page === 'review' ? <Review initialDay={nav.date} onEditDay={d => go('today', d)}/>
        : page === 'week' ? <Weekly/>
        : page === 'books' ? <Books/>
        : page === 'expenses' ? <Expenses/>
        : <Settings theme={theme} setTheme={setTheme}/>}
    </main>
    <div className="tabbar" role="navigation" aria-label="Main">{TABS.map(([id, icon, label]) => <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)}><Icon n={icon} size={22}/><span>{label}</span></button>)}<button className={more || page === 'review' || page === 'week' || page === 'settings' ? 'on' : ''} onClick={() => setMore(!more)}><Icon n="more" size={22}/><span>More</span></button></div>
    {more && <div className="sheet-wrap" onClick={() => setMore(false)}><div className="sheet more-sheet" role="dialog" aria-label="More" onClick={e => e.stopPropagation()}><div className="more-grid">{MORE.map(([id, icon, label]) => <button key={id} onClick={() => go(id)}><Icon n={icon} size={24}/><span>{label}</span></button>)}<button onClick={() => { setMore(false); setSearching(true); }}><Icon n="search" size={24}/><span>Search</span></button><button onClick={toggleTheme}><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={24}/><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button><button onClick={() => void supabase?.auth.signOut()}><Icon n="logout" size={24}/><span>Sign out</span></button></div></div></div>}
    {searching && <Search onGo={go} onClose={() => setSearching(false)}/>}<Toaster/>
  </div>;
}

function Today({ startDate, onGo }: { startDate: string; onGo: (page: Page) => void }) {
  const [date, setDate] = useState(startDate);
  const today = isoToday();
  const week = useMemo(() => { const first = shift(date, -parse(date).getDay()); return Array.from({ length: 7 }, (_, i) => shift(first, i)); }, [date]);
  const heading = date === today ? `${greeting()}, Shivam.` : date < today ? 'Looking back.' : 'Planning ahead.';
  return <section className="today-redesign">
    <header className="hero"><div><p className="kicker">{longDate(date)}</p><h1>{heading}</h1><span>One clear timetable. One meaningful day.</span></div><div className="hero-side"><span className="chip on">✦ Plan · Study · Reflect</span><div className="datenav"><button onClick={() => setDate(shift(date, -1))} aria-label="Previous day">‹</button><input type="date" value={date} onChange={e => setDate(e.target.value || today)}/><button onClick={() => setDate(shift(date, 1))} aria-label="Next day">›</button>{date !== today && <button className="today-btn" onClick={() => setDate(today)}>Today</button>}</div></div></header>
    <section className="commitment-banner" aria-label="Your daily commitment">
      <div className="commitment-content">
        <span className="commitment-eyebrow"><span className="commitment-spark">✦</span> A PROMISE TO MYSELF</span>
        <h2>IT HAS TO BE DONE.<br/><span>SO I’LL DO IT</span><span className="commitment-period">.</span></h2>
        <p>No excuses. No waiting for the perfect day. <strong>Show up. Do the work. Keep going.</strong></p>
      </div>
      <div className="commitment-mark" aria-hidden="true">01<span>DAY<br/>AT A TIME</span></div>
    </section>
    <div className="strip">{week.map(d => <button key={d} className={`day ${d === date ? 'on' : ''}`} onClick={() => setDate(d)}><small>{parse(d).toLocaleDateString(undefined, { weekday: 'short' })}</small><b>{parse(d).getDate()}</b></button>)}</div>
    <Schedule date={date}/>
    <article className="intention compact-intention"><span>✦</span><div><p className="kicker">A thought for today</p><h3>{INTENTIONS[parse(date).getDate() % INTENTIONS.length]}</h3></div></article>
    <DailyReflection date={date} onSaved={() => undefined}/>
    <VisionBoard date={date}/>
    <button className="btn ghost" style={{ marginTop: 18 }} onClick={() => onGo('review')}>Explore your past days →</button>
  </section>;
}

function DailyReflection({ date, onSaved }: { date: string; onSaved: () => void }) {
  const [form, setForm] = useState({ target: '', done: '', learned: '', next: '' });
  const [message, setMessage] = useState('');
  const [topGoals, setTopGoals] = useState<{ title: string; done: boolean }[]>([]);
  useEffect(() => {
    let valid = true;
    const refresh = () => { void loadScheduleHistory().then(rows => {
      if (valid) setTopGoals(rows.find(r => r.entry_date === date)?.targets ?? []);
    }); };
    refresh();
    window.addEventListener('daymark-schedule-changed', refresh);
    return () => { valid = false; window.removeEventListener('daymark-schedule-changed', refresh); };
  }, [date]);
  const goalLines = topGoals.map(g => `• ${g.title}`).join('\n');
  const completedLines = topGoals.filter(g => g.done).map(g => `• ${g.title}`).join('\n');
  useEffect(() => {
    let valid = true;
    setForm({ target: '', done: '', learned: '', next: '' });
    setMessage('');
    void getReflection(date).then((r: Reflection | null) => {
      if (valid && r) {
        const savedTarget = r.daily_target ?? '';
        const marker = '\n\nOther plans:\n';
        const custom = savedTarget.startsWith('Top goals:\n') ? (savedTarget.includes(marker) ? savedTarget.split(marker).slice(1).join(marker) : '') : savedTarget;
        const savedDone = r.completed ?? '';
        const doneMarker = '\n\nOther accomplishments:\n';
        const customDone = savedDone.startsWith('Checked goals:\n') ? (savedDone.includes(doneMarker) ? savedDone.split(doneMarker).slice(1).join(doneMarker) : '') : savedDone;
        setForm({ target: custom, done: customDone, learned: r.learned ?? '', next: r.improve_tomorrow ?? '' });
      }
    }).catch(() => undefined);
    return () => { valid = false; };
  }, [date]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const planned = goalLines ? `Top goals:\n${goalLines}${form.target.trim() ? `\n\nOther plans:\n${form.target.trim()}` : ''}` : form.target;
    const achieved = completedLines ? `Checked goals:\n${completedLines}${form.done.trim() ? `\n\nOther accomplishments:\n${form.done.trim()}` : ''}` : form.done;
    try { await saveReflection({ entry_date: date, daily_target: planned, completed: achieved, learned: form.learned, improve_tomorrow: form.next }); setMessage('Reflection saved ✓'); onSaved(); }
    catch (err) { setMessage(failure(err)); }
  }
  return <form className="panel reflection-redesign reflection-simple" onSubmit={save}>
    <p className="kicker">END OF DAY · {shortDate(date)}</p><h2>Your day, in two parts.</h2><p className="schedule-help">Everything you plan and tick in Today appears here automatically. Add a personal note only if you want.</p>
    <div className="reflection-duo">
      <section className="reflection-half"><div className="reflection-half-head"><span className="reflection-half-icon">◎</span><div><small>THE INTENTION</small><h3>What I planned</h3></div><b>{topGoals.length}</b></div>
        {topGoals.length ? <ul className="reflection-auto-list">{topGoals.map((goal, i) => <li key={i}><span className={goal.done ? 'auto-done' : ''}>{goal.title}</span></li>)}</ul> : <p className="reflection-placeholder">Your goals will appear here as soon as you add them above.</p>}
        <label className="reflection-note-label">Optional note<textarea rows={3} value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))} placeholder="Anything else you planned?"/></label>
      </section>
      <section className="reflection-half"><div className="reflection-half-head"><span className="reflection-half-icon finished-icon">✓</span><div><small>THE PROGRESS</small><h3>What I completed</h3></div><b>{topGoals.filter(g => g.done).length}</b></div>
        {topGoals.some(g => g.done) ? <ul className="reflection-auto-list done-list">{topGoals.filter(g => g.done).map((goal, i) => <li key={i}>✓ {goal.title}</li>)}</ul> : <p className="reflection-placeholder">When you tick a goal above, your achievement will show up here.</p>}
        <label className="reflection-note-label">Optional note<textarea rows={3} value={form.done} onChange={e => setForm(p => ({ ...p, done: e.target.value }))} placeholder="Any other accomplishment worth remembering?"/></label>
      </section>
    </div>
    <div className="reflection-bottom"><span>✦ The goal checkboxes tell your story.</span><button className="btn">Save reflection</button><span className="ok" role="status">{message}</span></div>
  </form>;
}

function Settings({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return <section><Title eyebrow="Daymark" title="Settings" text="Make Daymark feel like yours."/><div className="settings"><article className="setting"><div><h3>Appearance</h3><p>Switch between a light and dark theme.</p></div><div className="seg"><button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button><button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button></div></article><InstallCard/><Backup/></div></section>;
}
