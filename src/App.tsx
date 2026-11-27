import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getReflection, listOwned, saveReflection } from './lib/api';
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
import { QUOTES } from './quotes';

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
  return session ? <Layout userId={session.user.id} userName={session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'there'} theme={theme} setTheme={setTheme} /> : <Auth />;
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

function Layout({ userId, userName, theme, setTheme }: { userId: string; userName: string; theme: Theme; setTheme: (t: Theme) => void }) {
  setScheduleUser(userId);
  useScheduleReminders();
  const [nav, setNav] = useState<{ page: Page; date: string | null }>({ page: 'today', date: null });
  const [more, setMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notificationPrompt, setNotificationPrompt] = useState(() => !store.get('daymark-notification-asked'));
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
      {page === 'today' || page === 'schedule' ? <Today startDate={nav.date ?? isoToday()} onGo={go} userName={userName}/>
        : page === 'goals' ? <Goals/>
        : page === 'review' ? <Review initialDay={nav.date} onEditDay={d => go('today', d)}/>
        : page === 'week' ? <Weekly/>
        : page === 'books' ? <Books/>
        : page === 'expenses' ? <Expenses/>
        : <Settings theme={theme} setTheme={setTheme}/>}
    </main>
    <div className="tabbar" role="navigation" aria-label="Main">{TABS.map(([id, icon, label]) => <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)}><Icon n={icon} size={22}/><span>{label}</span></button>)}<button className={more || page === 'review' || page === 'week' || page === 'settings' ? 'on' : ''} onClick={() => setMore(!more)}><Icon n="more" size={22}/><span>More</span></button></div>
    {more && <div className="sheet-wrap" onClick={() => setMore(false)}><div className="sheet more-sheet" role="dialog" aria-label="More" onClick={e => e.stopPropagation()}><div className="more-grid">{MORE.map(([id, icon, label]) => <button key={id} onClick={() => go(id)}><Icon n={icon} size={24}/><span>{label}</span></button>)}<button onClick={() => { setMore(false); setSearching(true); }}><Icon n="search" size={24}/><span>Search</span></button><button onClick={toggleTheme}><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={24}/><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button><button onClick={() => void supabase?.auth.signOut()}><Icon n="logout" size={24}/><span>Sign out</span></button></div></div></div>}
    {notificationPrompt && <div className="notification-overlay"><div className="notification-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div className="notification-icon">✦</div><p className="notification-kicker">A LITTLE HELP STAYING ON TRACK</p><h2 id="notification-title">Make room for<br/>what matters.</h2><p>Get a gentle reminder when it’s time for your next routine activity.</p><div className="notification-detail"><span>◷</span><div><strong>On your schedule</strong><small>Reminders work while Daymark is open. Change your preference anytime in Settings.</small></div></div><div className="notification-actions"><button className="btn" onClick={() => { store.set('daymark-notification-asked', 'yes'); setNotificationPrompt(false); if ('Notification' in window) void Notification.requestPermission().then(p => { store.set('daymark-reminders', p === 'granted' ? 'yes' : 'no'); window.dispatchEvent(new Event('daymark-schedule-changed')); }); }}>Enable reminders <span>→</span></button><button className="notification-later" onClick={() => { store.set('daymark-notification-asked', 'yes'); store.set('daymark-reminders', 'no'); setNotificationPrompt(false); }}>Maybe later</button></div></div></div>}
    {searching && <Search onGo={go} onClose={() => setSearching(false)}/>}<Toaster/>
  </div>;
}

function Today({ startDate, onGo, userName }: { startDate: string; onGo: (page: Page) => void; userName: string }) {
  const [date, setDate] = useState(startDate);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  const today = isoToday();
  const [activity, setActivity] = useState<Set<string>>(new Set());
  useEffect(() => {
    const refresh = () => { void Promise.all([loadScheduleHistory(), listOwned<Reflection>('daily_reflections').catch(() => [])]).then(([days, notes]) => setActivity(new Set([...days.map(d => d.entry_date), ...notes.map(n => n.entry_date)]))); };
    refresh(); window.addEventListener('daymark-schedule-changed', refresh);
    return () => window.removeEventListener('daymark-schedule-changed', refresh);
  }, []);
  let streak = 0;
  let streakDate = activity.has(today) ? today : shift(today, -1);
  while (activity.has(streakDate)) { streak++; streakDate = shift(streakDate, -1); }
  const week = useMemo(() => { const first = shift(date, -parse(date).getDay()); return Array.from({ length: 7 }, (_, i) => shift(first, i)); }, [date]);
  const heading = date === today ? `${greeting()}, ${userName}.` : date < today ? 'Looking back.' : 'Planning ahead.';
  return <section className="today-redesign">
    <header className="hero"><div><p className="kicker">{longDate(date)}</p><h1>{heading}</h1><span>A little focus. A meaningful day.</span></div><div className="hero-side"><span className="chip on">✦ Plan · Study · Reflect</span><div className="datenav"><button onClick={() => setDate(shift(date, -1))} aria-label="Previous day">‹</button><input type="date" value={date} onChange={e => setDate(e.target.value || today)}/><button onClick={() => setDate(shift(date, 1))} aria-label="Next day">›</button>{date !== today && <button className="today-btn" onClick={() => setDate(today)}>Today</button>}</div></div></header>
    <section className="commitment-banner" aria-label="Your daily commitment">
      <div className="commitment-content">
        <span className="commitment-eyebrow"><span className="commitment-spark">✦</span> A PROMISE TO MYSELF</span>
        <h2>{quote[0]}</h2>
        <p>{quote[1]}</p>
      </div>
      <div className="commitment-mark" aria-hidden="true">✦<span>ONE DAY<br/>AT A TIME</span></div>
    </section>
    <div className="streak-card"><span className="streak-flame" aria-hidden="true">✦</span><div><small>YOUR CONSISTENCY</small><strong>{streak} <span>day{streak === 1 ? '' : 's'} in a row</span></strong><p>{streak ? 'Keep showing up for yourself.' : 'Make today the start of something great.'}</p></div><span className="streak-end">ONE DAY AT A TIME ↗</span></div>
    <div className="strip">{week.map(d => <button key={d} className={`day ${d === date ? 'on' : ''}`} onClick={() => setDate(d)}><small>{parse(d).toLocaleDateString(undefined, { weekday: 'short' })}</small><b>{parse(d).getDate()}</b>{activity.has(d) && <i aria-label="Activity recorded"/>}</button>)}</div>
    {date < today && <p>Past days are read-only.</p>}
    <fieldset disabled={date < today} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <Schedule date={date}/>
    <ReadingShelf/>
    <article className="intention compact-intention"><span>✦</span><div><p className="kicker">A thought for today</p><h3>{INTENTIONS[parse(date).getDate() % INTENTIONS.length]}</h3></div></article>
    <DailyReflection date={date} onSaved={() => undefined}/>
    <VisionBoard date={date}/>
    </fieldset>
    <button className="btn ghost" style={{ marginTop: 18 }} onClick={() => onGo('review')}>Explore your past days →</button>
  </section>;
}

const READING = {
  'Computer science': { intro: 'Build the foundations: how computers work, how software is designed, and how systems communicate.', items: [
    ['START HERE · COURSE', 'Berkeley CS61C', 'Computer architecture, machine structures and low-level systems.', 'https://cs61c.org/'],
    ['FOUNDATIONS · COURSE', 'The Missing Semester', 'Practical command line, tools and version control from MIT.', 'https://missing.csail.mit.edu/'],
    ['SYSTEMS · BLOG', 'Julia Evans', 'Friendly explanations of Linux, networking and debugging.', 'https://jvns.ca/'],
    ['ARCHITECTURE · BLOG', 'Martin Fowler', 'Software design, refactoring and architecture.', 'https://martinfowler.com/'],
    ['INFRASTRUCTURE · BLOG', 'Cloudflare', 'Networking, security and the internet in practice.', 'https://blog.cloudflare.com/'],
    ['ENGINEERING · BLOG', 'GitHub Engineering', 'How developer platforms and production systems are built.', 'https://github.blog/engineering/'],
    ['SCALE · BLOG', 'Netflix TechBlog', 'Production systems, reliability and engineering at scale.', 'https://netflixtechblog.com/'],
  ] },
  'AI': { intro: 'Start with practical learning, then explore research and the systems behind AI.', items: [
    ['START HERE · COURSE', 'fast.ai', 'Learn deep learning by building working models.', 'https://course.fast.ai/'],
    ['FOUNDATIONS · COURSE', 'Google ML Crash Course', 'Interactive lessons and exercises on machine learning fundamentals.', 'https://developers.google.com/machine-learning/crash-course'],
    ['RESEARCH · BLOG', 'Google Research', 'Research across machine learning and computer science.', 'https://research.google/blog/'],
    ['DEEP DIVE · BLOG', 'Lil’Log', 'Detailed explanations of machine learning ideas.', 'https://lilianweng.github.io/'],
    ['VISUAL · ARCHIVE', 'Distill', 'Visual, peer-reviewed machine learning explainers; publishing is on hiatus.', 'https://distill.pub/'],
    ['INDUSTRY · NEWS', 'TechCrunch AI', 'News on AI companies, products and the industry.', 'https://techcrunch.com/category/artificial-intelligence/'],
  ] },
  'LLMs': { intro: 'Understand transformers, experiment with models, and learn how AI applications are built.', items: [
    ['START HERE · COURSE', 'Hugging Face LLM Course', 'A guided path through transformers, inference and fine-tuning.', 'https://huggingface.co/learn/llm-course/'],
    ['CLASSIC · EXPLAINER', 'The Illustrated Transformer', 'A visual introduction to transformer architecture.', 'https://jalammar.github.io/illustrated-transformer/'],
    ['BUILD FROM SCRATCH · COURSE', 'Neural Networks: Zero to Hero', 'Andrej Karpathy builds neural networks and language models in code.', 'https://karpathy.ai/zero-to-hero.html'],
    ['PRACTICAL · BLOG', 'Simon Willison', 'Hands-on LLM experiments, tools and software.', 'https://simonwillison.net/'],
    ['ENGINEERING · BLOG', 'Anthropic Engineering', 'Building and evaluating AI systems and agents.', 'https://www.anthropic.com/engineering'],
    ['SYSTEMS · BLOG', 'Chip Huyen', 'Practical thinking about production AI systems.', 'https://huyenchip.com/blog/'],
  ] },
  'Finance': { intro: 'Learn the fundamentals first, then explore businesses and markets with a critical eye.', items: [
    ['START HERE · GUIDE', 'Investor.gov', 'Plain-language investing, risk and diversification basics; US-focused.', 'https://www.investor.gov/introduction-investing'],
    ['INDIA · REGULATOR', 'SEBI Investor', 'Official education on Indian markets, funds and investor protection.', 'https://investor.sebi.gov.in/iematerial.html'],
    ['INDIA · LESSONS', 'Zerodha Varsity', 'Free, structured lessons on markets and financial concepts.', 'https://zerodha.com/varsity/'],
    ['VALUATION · COURSE', 'Aswath Damodaran', 'University resources on valuation and corporate finance.', 'https://pages.stern.nyu.edu/~adamodar/'],
    ['BUSINESS · NEWS', 'TechCrunch', 'Technology companies, startups and business news.', 'https://techcrunch.com/'],
  ] },
} as const;
function ReadingShelf() {
  const [section, setSection] = useState<keyof typeof READING>('Computer science');
  const selected = READING[section];
  return <section className="reading-shelf"><div className="reading-intro"><div><p className="kicker">YOUR LEARNING LIBRARY</p><h2>Curiosity, with direction.</h2><p>Choose a subject and explore one idea at a time. Understanding grows with practice.</p></div><span>READ · THINK · BUILD</span></div><div className="reading-tabs" role="group" aria-label="Reading subjects">{(Object.keys(READING) as (keyof typeof READING)[]).map(name => <button type="button" key={name} className={name === section ? 'active' : ''} aria-pressed={name === section} onClick={() => setSection(name)}>{name}</button>)}</div><div className="reading-section-head"><div><small>EXPLORE THE COLLECTION</small><h3>{section}</h3><p>{selected.intro}</p></div><span>{String(selected.items.length).padStart(2, '0')} SOURCES</span></div><div className="reading-grid">{selected.items.map(([category, name, description, url]) => <a className="reading-card" href={url} key={url} target="_blank" rel="noopener noreferrer"><div><small>{category}</small><span>↗</span></div><b>{name}</b><p>{description}</p><em>OPEN RESOURCE ↗</em></a>)}</div><p className="reading-note">✦ Read one useful piece, note the problem and how it works, then try it yourself.</p></section>;
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
    try { await saveReflection({ entry_date: date, daily_target: planned, completed: achieved, learned: form.learned, improve_tomorrow: form.next }); setMessage('Reflection saved ✓'); window.dispatchEvent(new Event('daymark-schedule-changed')); onSaved(); }
    catch (err) { setMessage(failure(err)); }
  }
  return <form className="panel reflection-redesign reflection-simple" onSubmit={save}>
    <p className="kicker">03 · END OF DAY · {shortDate(date)}</p><h2>Reflect and plan ahead.</h2><p className="schedule-help">Your priorities tell part of the story. Add a few words about the rest.</p>
    <div className="reflection-snapshot"><div><small>WHAT I PLANNED</small>{topGoals.length ? <ul>{topGoals.map((g, i) => <li key={i}>{g.title}</li>)}</ul> : <p>Your priorities will appear here.</p>}</div><div><small>WHAT I COMPLETED</small>{topGoals.some(g => g.done) ? <ul>{topGoals.filter(g => g.done).map((g, i) => <li key={i}>✓ {g.title}</li>)}</ul> : <p>Check a priority above to see it here.</p>}</div></div>
    <div className="reflection-prompts"><label className="reflection-note-label">What else did you do today?<textarea rows={3} value={form.done} onChange={e => setForm(p => ({ ...p, done: e.target.value }))} placeholder="A win, a lesson, or a moment worth remembering…"/></label>
    <label className="reflection-note-label">What would you like to focus on tomorrow?<textarea rows={3} value={form.next} onChange={e => setForm(p => ({ ...p, next: e.target.value }))} placeholder="A small step for tomorrow…"/></label></div>
    <div className="reflection-bottom"><button className="btn">Save reflection</button><span className="ok" role="status">{message}</span></div>
  </form>;
}

function Settings({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const [enabled, setEnabled] = useState(store.get('daymark-reminders') === 'yes');
  const [notice, setNotice] = useState('');
  async function toggleNotifications() {
    if (enabled) { store.set('daymark-reminders', 'no'); setEnabled(false); }
    else if (!('Notification' in window)) setNotice('Notifications are not supported in this browser.');
    else { const permission = await Notification.requestPermission(); if (permission === 'granted') { store.set('daymark-reminders', 'yes'); setEnabled(true); setNotice(''); } else setNotice('Allow notifications in your browser settings to enable reminders.'); }
    window.dispatchEvent(new Event('daymark-schedule-changed'));
  }
  return <section><Title eyebrow="Daymark" title="Settings" text="Make Daymark feel like yours."/><div className="settings"><article className="setting"><div><h3>Notifications</h3><p>Routine reminders while Daymark is open. {notice}</p></div><button className="chip" onClick={() => void toggleNotifications()}>{enabled ? 'Turn off' : 'Turn on'}</button></article><article className="setting"><div><h3>Appearance</h3><p>Switch between a light and dark theme.</p></div><div className="seg"><button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button><button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button></div></article><InstallCard/><Backup/></div></section>;
}
