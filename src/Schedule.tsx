import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { listOwned, saveOwned } from './lib/api';
import { notify } from './lib/notify';
import { isoToday } from './lib/planning';
import { failure, store } from './util';

export type Mode = 'home' | 'college';
export type Block = { id: string; time: string; starts: string; ends?: string; title: string; kind?: 'study' | 'break' | 'stack' };
export type DayRecord = { id?: string; entry_date: string; mode: Mode; completed: string[]; targets: { title: string; done: boolean; time?: string; end?: string }[]; board_note: string; board_path: string | null };
export const HOME: Block[] = [
  { id: 'wake', time: '5:30–6:00 AM', starts: '05:30', title: 'Wake up and freshen up' },
  { id: 'exercise', time: '6:00–7:00 AM', starts: '06:00', title: 'Workout / running' },
  { id: 'morning', time: '7:00–9:00 AM', starts: '07:00', title: 'Bath, breakfast and cooking' },
  { id: 'ready', time: '9:00–9:30 AM', starts: '09:00', title: 'Prepare your study table' },
  { id: 'study1', time: '9:30–11:00 AM', starts: '09:30', title: 'Study session 1 · highest-priority subject', kind: 'study' },
  { id: 'break1', time: '11:00–11:10 AM', starts: '11:00', title: 'Short break', kind: 'break' },
  { id: 'study2', time: '11:10 AM–12:40 PM', starts: '11:10', title: 'Study session 2 · DU / IGNOU', kind: 'study' },
  { id: 'lunch', time: '12:40–1:40 PM', starts: '12:40', title: 'Lunch and rest (one hour)', kind: 'break' },
  { id: 'study3', time: '1:40–3:10 PM', starts: '13:40', title: 'Study session 3 · practicals / assignments', kind: 'study' },
  { id: 'break2', time: '3:10–3:20 PM', starts: '15:10', title: 'Short break', kind: 'break' },
  { id: 'study4', time: '3:20–4:50 PM', starts: '15:20', title: 'Study session 4 · practice questions', kind: 'study' },
  { id: 'review', time: '4:50–5:00 PM', starts: '16:50', title: 'Review today’s study', kind: 'study' },
  { id: 'free', time: '5:00–6:00 PM', starts: '17:00', title: 'Free time / unfinished work', kind: 'break' },
  { id: 'dinner', time: '6:00–8:00 PM', starts: '18:00', title: 'Cooking, dinner and cleaning' },
  { id: 'reset', time: '8:00–8:30 PM', starts: '20:00', title: 'Rest and prepare for coding', kind: 'break' },
  { id: 'fullstack', time: '8:30–10:30 PM', starts: '20:30', title: 'Full-stack development · learn and build', kind: 'stack' },
  { id: 'tomorrow', time: '10:30–10:40 PM', starts: '22:30', title: 'Set tomorrow’s three goals' },
  { id: 'sleep', time: '10:40–11:00 PM', starts: '22:40', title: 'Wind down and sleep' },
];
export const COLLEGE: Block[] = [
  { id: 'wake', time: '6:00–6:15 AM', starts: '06:00', title: 'Wake up and freshen up' },
  { id: 'exercise', time: '6:15–6:45 AM', starts: '06:15', title: 'Short workout' },
  { id: 'morning', time: '6:45–8:00 AM', starts: '06:45', title: 'Bath, breakfast, cooking and packing' },
  { id: 'college', time: '8:00 AM–5:30 PM', starts: '08:00', title: 'College + travel (including classes)', kind: 'study' },
  { id: 'free', time: '5:30–6:00 PM', starts: '17:30', title: 'Rest after college', kind: 'break' },
  { id: 'dinner', time: '6:00–8:00 PM', starts: '18:00', title: 'Cooking and dinner' },
  { id: 'reset', time: '8:00–8:30 PM', starts: '20:00', title: 'Rest and prepare for coding', kind: 'break' },
  { id: 'fullstack', time: '8:30–10:30 PM', starts: '20:30', title: 'Full-stack development · learn and build', kind: 'stack' },
  { id: 'tomorrow', time: '10:30–10:40 PM', starts: '22:30', title: 'Set tomorrow’s three goals' },
  { id: 'sleep', time: '10:40–11:00 PM', starts: '22:40', title: 'Wind down and sleep' },
];

let scheduleUserId = '';
export function setScheduleUser(id: string) { scheduleUserId = id; }
const defaultRecord = (date: string): DayRecord => ({ entry_date: date, mode: 'home', completed: [], targets: [], board_note: '', board_path: null });
const key = (date: string) => `daymark-schedule-${scheduleUserId}-${date}`;
type Templates = Record<Mode, Block[]>;
const emptyTemplates = (): Templates => ({ home: [], college: [] });
const templateKey = (mode: Mode) => `daymark-routine-${scheduleUserId}-${mode}`;
const readTemplates = (): Templates => {
  try { return { home: JSON.parse(store.get(templateKey('home')) || '[]'), college: JSON.parse(store.get(templateKey('college')) || '[]') }; }
  catch { return emptyTemplates(); }
};
const writeTemplates = (templates: Templates) => {
  (['home', 'college'] as Mode[]).forEach(mode => store.set(templateKey(mode), JSON.stringify(templates[mode])));
  window.dispatchEvent(new Event('daymark-routines-changed'));
};
export async function loadRoutineTemplates(): Promise<Templates> {
  const local = readTemplates();
  try {
    const cloud = await listOwned<{ mode: Mode; blocks: Block[] }>('schedule_templates').catch(() => []);
    const hasLocal = store.get(templateKey('home')) !== null || store.get(templateKey('college')) !== null;
    if (cloud.length) {
      for (const row of cloud) if (row.mode === 'home' || row.mode === 'college') local[row.mode] = validBlocks(row.blocks ?? []);
      writeTemplates(local);
    } else if (!hasLocal) {
      const history = await listOwned<DayRecord>('schedule_days').catch(() => []);
      // Accounts with existing records retain the original routines on upgrade.
      // New accounts get empty templates instead.
      const initial: Templates = history.length ? { home: HOME, college: COLLEGE } : emptyTemplates();
      writeTemplates(initial);
      for (const mode of ['home', 'college'] as Mode[]) {
        try { await saveOwned('schedule_templates', { mode, blocks: initial[mode] }, 'user_id,mode'); }
        catch { /* Keep personal local routine until the SQL migration runs. */ }
      }
      return initial;
    }
  } catch { /* Existing deployments can use scoped local routines until migrated. */ }
  return local;
}
function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const displayTime = (block: Block) => block.ends ? `${formatTime(block.starts)} – ${formatTime(block.ends)}` : block.time;
function validBlocks(blocks: Block[]) {
  return blocks.filter(b => typeof b.id === 'string' && typeof b.title === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.starts)).sort((a, b) => a.starts.localeCompare(b.starts));
}
function cached(date: string): DayRecord {
  try { return { ...defaultRecord(date), ...JSON.parse(store.get(key(date)) || '{}'), entry_date: date }; }
  catch { return defaultRecord(date); }
}
export async function loadScheduleHistory(): Promise<DayRecord[]> {
  const local: DayRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i) || '';
      if (name.startsWith(`daymark-schedule-${scheduleUserId}-`) && /\d{4}-\d{2}-\d{2}$/.test(name)) local.push(cached(name.slice(-10)));
    }
  } catch { /* Device storage may be restricted. */ }
  try {
    const cloud = await listOwned<DayRecord>('schedule_days');
    const merged = new Map(local.map(row => [row.entry_date, row]));
    cloud.forEach(row => merged.set(row.entry_date, row));
    return [...merged.values()];
  } catch { return local; }
}
function saveCache(row: DayRecord) {
  store.set(key(row.entry_date), JSON.stringify(row));
  window.dispatchEvent(new Event('daymark-schedule-changed'));
}

/** Notifications run only while the website is open; background push needs a server. */
export function useScheduleReminders() {
  useEffect(() => {
    let busy = false;
    let desktop: Notification | null = null;
    let desktopTag = '';
    const check = async () => {
      if (store.get('daymark-reminders') !== 'yes') {
        desktop?.close(); desktop = null;
        if ('serviceWorker' in navigator && import.meta.env.PROD) {
          void navigator.serviceWorker.ready.then(reg => reg.getNotifications()).then(items => items.filter(n => n.tag.startsWith('daymark-active-') || n.tag.startsWith('daymark-goal-')).forEach(n => n.close())).catch(() => undefined);
        }
        return;
      }
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (busy) return;
      busy = true;
      try {
      const now = new Date();
      const date = isoToday();
      const row = cached(date);
      const blocks = validBlocks(readTemplates()[row.mode]);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const active = blocks.reduce((found, b, index) => {
        const [h, m] = b.starts.split(':').map(Number);
        return h * 60 + m <= currentMinutes ? index : found;
      }, -1);
      const activeEnd = active >= 0 ? (blocks[active].ends ?? blocks[active + 1]?.starts ?? '23:00') : '00:00';
      const [endH, endM] = activeEnd.split(':').map(Number);
      const block = active >= 0 && currentMinutes < endH * 60 + endM && !row.completed.includes(blocks[active].id) ? blocks[active] : null;
      const tag = block ? `daymark-active-${date}-${block.id}` : '';
      const [hour, minute] = block?.starts.split(':').map(Number) ?? [0, 0];
      const minutesInBlock = block ? currentMinutes - hour * 60 - minute : 0;
      const exactReminder = Boolean(block && (minutesInBlock === 0 || (minutesInBlock > 0 && minutesInBlock % 60 === 0)));
      const hourlyKey = `daymark-hourly-${tag}-${minutesInBlock}`;
      const hourlyReminder = exactReminder && !store.get(hourlyKey);
      const lastKey = `daymark-last-notified-${tag}`;
      const lastAt = Number(store.get(lastKey) || '0');
      const title = block ? `Daymark · ${displayTime(block)}` : '';
      const body = block?.id === 'tomorrow' ? 'Before sleeping, write tomorrow’s top goals.' : `${block?.title ?? ''} · This is your current activity.`;
      if ('serviceWorker' in navigator && import.meta.env.PROD) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const notifications = await registration.getNotifications();
          notifications.filter(n => n.tag.startsWith('daymark-active-') && n.tag !== tag).forEach(n => n.close());
          if (!tag) notifications.filter(n => n.tag.startsWith('daymark-active-')).forEach(n => n.close());
          const exists = notifications.some(n => n.tag === tag);
          // A swiped-away alert can reappear while the app runs, but the OS
          // always retains final control over notifications.
          if (block && (hourlyReminder || (!exists && Date.now() - lastAt >= 60_000))) {
            const options = { body, tag, renotify: true, icon: '/icon-192.png', requireInteraction: true };
            await registration.showNotification(title, options);
            store.set(lastKey, String(Date.now()));
            if (hourlyReminder) store.set(hourlyKey, 'sent');
          }
          notifications.filter(n => n.tag.startsWith('daymark-goal-')).forEach(n => n.close());
        } catch { /* Browser/OS may refuse notifications. */ }
      } else {
        if (desktop && desktopTag !== tag) { desktop.close(); desktop = null; }
        if (block && (hourlyReminder || (!desktop && Date.now() - lastAt >= 60_000))) {
          desktop?.close();
          const created = new Notification(title, { body, tag, icon: '/icon-192.png', requireInteraction: true });
          desktop = created;
          desktopTag = tag;
          created.onclose = () => { if (desktop === created) desktop = null; };
          store.set(lastKey, String(Date.now()));
          if (hourlyReminder) store.set(hourlyKey, 'sent');
        }
      }
      if (currentMinutes === 20 * 60 + 30 && row.targets.some(t => !t.done) && !store.get(`daymark-stack-toast-${date}`)) {
        store.set(`daymark-stack-toast-${date}`, 'sent');
        notify('Full-stack time! Remember today’s goals.');
      }
      } finally { busy = false; }
    };
    void check();
    void loadRoutineTemplates().then(() => check());
    const interval = window.setInterval(() => void check(), 30_000);
    const changed = () => void check();
    window.addEventListener('daymark-schedule-changed', changed);
    window.addEventListener('daymark-routines-changed', changed);
    document.addEventListener('visibilitychange', changed);
    return () => { window.clearInterval(interval); window.removeEventListener('daymark-schedule-changed', changed); window.removeEventListener('daymark-routines-changed', changed); document.removeEventListener('visibilitychange', changed); desktop?.close(); };
  }, []);
}

export function Schedule({ date }: { date: string }) {
  const [record, setRecord] = useState<DayRecord>(() => cached(date));
  const [templates, setTemplates] = useState<Templates>(() => readTemplates());
  const [editingRoutine, setEditingRoutine] = useState(false);
  const [editBlockId, setEditBlockId] = useState<string | null>(null);
  const [draftBlock, setDraftBlock] = useState({ title: '', starts: '09:00', ends: '10:00', kind: '' });
  const [newGoal, setNewGoal] = useState('');
  const [message, setMessage] = useState('');
  const [syncReady, setSyncReady] = useState(true);
  const [reminders, setReminders] = useState(store.get('daymark-reminders') === 'yes');
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 30_000); return () => window.clearInterval(id); }, []);
  const blocks = validBlocks(templates[record.mode]);
  const completed = blocks.filter(b => record.completed.includes(b.id)).length;
  const progress = blocks.length ? Math.round(100 * completed / blocks.length) : 0;
  const remaining = useMemo(() => blocks.find(b => !record.completed.includes(b.id)), [blocks, record.completed]);
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes();
  const current = blocks.filter(b => { const [h, m] = b.starts.split(':').map(Number); return h * 60 + m <= nowMinutes; }).at(-1);
  const activeBlock = date === isoToday() && nowMinutes < 23 * 60 && current && !record.completed.includes(current.id) ? current : null;
  const upcomingBlock = blocks.find(b => { const [h, m] = b.starts.split(':').map(Number); return h * 60 + m > nowMinutes; });

  useEffect(() => {
    let alive = true;
    void loadRoutineTemplates().then(resolved => { if (alive) setTemplates(resolved); }).catch(err => { if (alive) setMessage(failure(err)); });
    return () => { alive = false; };
  }, []);
  async function saveTemplate(mode: Mode, nextBlocks: Block[]) {
    const next = { ...templates, [mode]: validBlocks(nextBlocks) };
    setTemplates(next);
    writeTemplates(next);
    try { await saveOwned('schedule_templates', { mode, blocks: next[mode] }, 'user_id,mode'); }
    catch { setMessage('Routine saved on this device. Run the new schedule_templates SQL in Supabase to sync privately across devices.'); }
  }
  function startEditing(block?: Block, index?: number) {
    setEditBlockId(block?.id ?? null);
    setDraftBlock(block ? {
      title: block.title, starts: block.starts,
      ends: block.ends ?? blocks[(index ?? -1) + 1]?.starts ?? '23:00',
      kind: block.kind ?? '',
    } : { title: '', starts: '09:00', ends: '10:00', kind: '' });
    setEditingRoutine(true);
  }
  function commitBlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draftBlock.title.trim() || draftBlock.ends <= draftBlock.starts) { setMessage('Add a title and make the finish time later than the start time.'); return; }
    const newBlock: Block = { id: editBlockId ?? crypto.randomUUID(), starts: draftBlock.starts, ends: draftBlock.ends, time: `${formatTime(draftBlock.starts)} – ${formatTime(draftBlock.ends)}`, title: draftBlock.title.trim(), ...(draftBlock.kind ? { kind: draftBlock.kind as Block['kind'] } : {}) };
    const other = blocks.filter(b => b.id !== editBlockId);
    if (other.some(b => {
      const otherEnd = b.ends ?? blocks[blocks.findIndex(x => x.id === b.id) + 1]?.starts ?? '23:00';
      return newBlock.starts < otherEnd && newBlock.ends! > b.starts;
    })) { setMessage('This time overlaps another routine block. Choose a free time or edit the existing block.'); return; }
    void saveTemplate(record.mode, [...other, newBlock]);
    setEditingRoutine(false); setEditBlockId(null); setMessage('');
  }

  const load = useCallback(async (day: string) => {
    setRecord(cached(day));
    setMessage('');
    try {
      const rows = await listOwned<DayRecord>('schedule_days');
      const cloud = rows.find(r => r.entry_date === day);
      if (cloud) { setRecord(cloud); saveCache(cloud); }
      setSyncReady(true);
    } catch { setSyncReady(false); setMessage('Schedule is saved on this device. Run the new Supabase SQL migration to sync between devices.'); }
  }, []);
  useEffect(() => { void load(date); }, [date, load]);

  async function persist(next: DayRecord) {
    setRecord(next);
    saveCache(next);
    if (!syncReady) return;
    try {
      const cloud = (await listOwned<DayRecord>('schedule_days')).find(row => row.entry_date === next.entry_date);
      await saveOwned('schedule_days', { entry_date: next.entry_date, mode: next.mode, completed: next.completed, targets: next.targets, board_note: cloud?.board_note ?? next.board_note, board_path: cloud?.board_path ?? next.board_path }, 'user_id,entry_date');
      // Refresh derived reflection views after the cloud row is current too.
      saveCache(next);
    } catch (err) { setSyncReady(false); setMessage(`Saved on this device only. Cloud sync needs setup: ${failure(err)}`); }
  }
  function toggleBlock(block: Block, done: boolean) {
    const next = { ...record, completed: done ? [...record.completed, block.id] : record.completed.filter(id => id !== block.id) };
    void persist(next);
    if (done) {
      const upcoming = blocks.find(b => !next.completed.includes(b.id));
      if (upcoming) notify(`Checked ✓ · Next: ${upcoming.time} — ${upcoming.title}`);
    }
  }
  async function enableNotifications() {
    if (!('Notification' in window)) { setMessage('This browser does not support notifications. Try installing Daymark from Android Chrome.'); return; }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') { store.set('daymark-reminders', 'yes'); setReminders(true); window.dispatchEvent(new Event('daymark-schedule-changed')); setMessage('Reminders enabled on this device while Daymark is running. Android may still allow dismissal.'); }
    else setMessage('Notification permission was not granted. You can still use the schedule.');
  }
  async function testNotification() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') { setMessage('Enable browser notifications first, then try the test.'); return; }
    try {
      if ('serviceWorker' in navigator && import.meta.env.PROD) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('Daymark reminders are ready ✓', { body: 'Your fixed timetable will remind you when the next activity starts.', icon: '/icon-192.png', tag: 'daymark-test', requireInteraction: true });
      } else new Notification('Daymark reminders are ready ✓', { body: 'Your timetable notifications are enabled.', icon: '/icon-192.png', tag: 'daymark-test', requireInteraction: true });
      setMessage('Test reminder sent. Check your browser and device notification settings if it did not appear.');
    } catch { setMessage('The browser could not display the test. Check site notification permission and device settings.'); }
  }

  return <section className="schedule-page">
    <div className="schedule-toolbar panel">
      <div><p className="kicker">Your daily timetable</p><h2>Is this a college day or a home day?</h2><p className="schedule-help">Choose for {date === isoToday() ? 'today' : date}. You can also prepare another day using the date selector above.</p></div>
      <div className="schedule-switch" role="group" aria-label="Choose schedule type">
        <button className={record.mode === 'home' ? 'active' : ''} onClick={() => { if (record.mode !== 'home') void persist({ ...record, mode: 'home', completed: [] }); }}>⌂ Home day</button>
        <button className={record.mode === 'college' ? 'active' : ''} onClick={() => { if (record.mode !== 'college') void persist({ ...record, mode: 'college', completed: [] }); }}>▤ College day</button>
      </div>
      <div className="reminder-controls">
        <div><b>🔔 Routine reminders</b><span>{reminders ? 'Enabled on this device' : 'Currently off'} · Fixed tasks only</span><small>{date === isoToday() && upcomingBlock ? `Next: ${upcomingBlock.starts} · ${upcomingBlock.title}` : 'Each routine block has its own start-time reminder.'}</small></div>
        {reminders ? <button className="chip" onClick={() => { store.set('daymark-reminders', 'no'); setReminders(false); window.dispatchEvent(new Event('daymark-schedule-changed')); }}>Turn off</button> : <button className="btn" onClick={() => void enableNotifications()}>Enable reminders</button>}
        <button className="chip" onClick={() => void testNotification()}>Send test</button>
      </div>
      <p className="reminder-hint">Notifications work while Daymark is running. To receive reliable alerts when it is closed, a separate web-push backend is required; your phone may allow notifications to be dismissed.</p>
    </div>
    {activeBlock && <div className="schedule-now" role="status"><span className="schedule-now-dot"/><div><small>YOUR CURRENT BLOCK · {displayTime(activeBlock)}</small><b>{activeBlock.title}</b><span>Stays here until you mark the activity complete.</span></div><button className="btn" onClick={() => toggleBlock(activeBlock, true)}>Mark done ✓</button></div>}
    <div className="routine-manage-bar"><div><b>My routine</b><p>Only you can see and change the timetable saved to your account.</p></div><button className="chip on" onClick={() => { setEditingRoutine(v => !v); setEditBlockId(null); }}>{editingRoutine ? 'Close editor' : '✎ Edit my routine'}</button></div>
    {editingRoutine && <section className="panel routine-editor">
      <div className="schedule-section-heading"><h2>{editBlockId ? 'Edit this activity' : 'Add an activity'}</h2><span>{record.mode === 'home' ? 'Home day' : 'College day'}</span></div>
      <form className="routine-edit-form" onSubmit={commitBlock}>
        <label>Activity title<input value={draftBlock.title} onChange={e => setDraftBlock(v => ({ ...v, title: e.target.value }))} placeholder="e.g. Study Python or morning workout" required maxLength={150}/></label>
        <label>Starts at<input type="time" required value={draftBlock.starts} onChange={e => setDraftBlock(v => ({ ...v, starts: e.target.value }))}/></label>
        <label>Ends at<input type="time" required value={draftBlock.ends} onChange={e => setDraftBlock(v => ({ ...v, ends: e.target.value }))}/></label>
        <label>Activity type<select value={draftBlock.kind} onChange={e => setDraftBlock(v => ({ ...v, kind: e.target.value }))}><option value="">Daily life</option><option value="study">Study</option><option value="stack">Full-stack / coding</option><option value="break">Break / rest</option></select></label>
        <button className="btn">{editBlockId ? 'Save changes' : '+ Add activity'}</button>
        {editBlockId && <button type="button" className="chip" onClick={() => startEditing()}>Cancel edit</button>}
      </form>
      <p className="schedule-help">Every saved activity can trigger a reminder at its start time. Each account owns its own Home and College routines.</p>
    </section>}
    <div className="schedule-summary">
      <article className="stat"><b>{progress}%</b><span>Schedule complete</span></article>
      <article className="stat"><b>{completed}/{blocks.length}</b><span>Activities checked</span></article>
      <article className="stat"><b>{record.targets.filter(t => t.done).length}/{record.targets.length}</b><span>Daily goals achieved</span></article>
    </div>
    <div className="progress"><i style={{ width: `${progress}%` }} /></div>
    <div className="schedule-columns">
      <article className="panel schedule-list"><div className="schedule-section-heading"><h2>{record.mode === 'home' ? 'Your home-day routine' : 'Your college-day routine'}</h2><span>{!blocks.length ? 'Create your own timetable below' : remaining ? `Next to check: ${remaining.title}` : 'Everything completed!'}</span></div>
        {!blocks.length && <div className="routine-empty"><span>✦</span><h3>Your day, your rhythm.</h3><p>You haven't created a {record.mode} routine yet. Add your first activity, choose a time, and Daymark will build your timetable.</p><button className="btn" onClick={() => startEditing()}>+ Create my timetable</button></div>}
        {blocks.map((b, i) => <div key={b.id} className="routine-block-line"><label className={`schedule-block ${b.id} ${record.completed.includes(b.id) ? 'finished' : ''} ${b.kind || ''}`}>
          <input type="checkbox" checked={record.completed.includes(b.id)} onChange={e => toggleBlock(b, e.target.checked)} />
          <span className="schedule-time">{displayTime(b)}</span><span className="schedule-name">{b.title}</span>
        </label>{editingRoutine && <div className="routine-row-actions"><button className="chip" onClick={() => startEditing(b, i)}>Edit</button><button className="chip danger-chip" onClick={() => { if (window.confirm(`Delete “${b.title}” from your ${record.mode} routine?`)) void saveTemplate(record.mode, blocks.filter(x => x.id !== b.id)); }}>Delete</button></div>}</div>)}
      </article>
      <div className="schedule-aside">
        <article className="panel today-priorities"><div className="schedule-section-heading"><div><p className="kicker">TODAY'S PRIORITIES</p><h2>Three things that matter.</h2></div><span>{record.targets.filter(t => t.done).length} of {record.targets.length} done</span></div>
          <p className="schedule-help">Just write what you want to achieve. Your planned and completed goals will appear automatically in your reflection.</p>
          <form className="priority-simple" onSubmit={e => { e.preventDefault(); if (!newGoal.trim()) return; void persist({ ...record, targets: [...record.targets, { title: newGoal.trim(), done: false }] }); setNewGoal(''); }}>
            <input aria-label="New daily priority" placeholder="e.g. Finish Python practical 4" value={newGoal} onChange={e => setNewGoal(e.target.value)} required />
            <button className="btn">+ Add</button>
          </form>
          <div className="priority-progress" aria-label="Daily goals completed"><i style={{ width: `${record.targets.length ? record.targets.filter(t => t.done).length / record.targets.length * 100 : 0}%` }}/></div>
          <div className="priority-list">{record.targets.map((t, i) => <div className={`priority-item ${t.done ? 'is-finished' : ''}`} key={i}><input aria-label={`Complete ${t.title}`} type="checkbox" checked={t.done} onChange={() => void persist({ ...record, targets: record.targets.map((x, ix) => ix === i ? { ...x, done: !x.done } : x) })}/><div><b>{t.title}</b></div><button className="plain" aria-label={`Remove ${t.title}`} onClick={() => void persist({ ...record, targets: record.targets.filter((_, ix) => ix !== i) })}>×</button></div>)}</div>
          {!record.targets.length && <p className="priority-empty">✦ Start with one small win. Add a goal above.</p>}
        </article>
      </div>
    </div>
    {message && <p className="schedule-message" role="status">{message}</p>}
  </section>;
}
