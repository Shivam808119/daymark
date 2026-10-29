import type { Task } from './lib/types';

export const failure = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export const pad = (n: number) => String(n).padStart(2, '0');
export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const shift = (iso: string, days: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + days);
  return fmt(d);
};
export const shiftMonth = (iso: string, n: number) => {
  const d = parse(iso);
  d.setMonth(d.getMonth() + n, 1);
  return fmt(d);
};
export const longDate = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  },
};

export const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
export const bullets = (tasks: Task[]) => tasks.map(t => `• ${t.title}`).join('\n');
export const moodOf = (date: string): number | null => {
  const v = store.get(`daymark-mood-${date}`);
  return v === null ? null : Number(v);
};
export const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export const MOODS: [string, string][] = [['😞', 'Rough'], ['😕', 'Meh'], ['🙂', 'Okay'], ['😊', 'Good'], ['🤩', 'Great']];
export const INTENTIONS = [
  'Slow down enough to choose what matters.',
  'One honest page is better than a perfect plan.',
  'Small days become a life.',
  'Do the next right thing, then rest.',
  'Progress, not performance.',
  'Be kind to the person you are today.',
  'Start where you are, with what you have.',
];

export type Page = 'today' | 'goals' | 'review' | 'week' | 'books' | 'expenses' | 'settings';

export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
/** Monday of the week containing the given date. */
export const monday = (iso: string) => shift(iso, -((parse(iso).getDay() + 6) % 7));
/** Goal progress: from checklist steps when it has any, else the saved percentage. */
export const goalPct = (g: { id: string; completion_percentage?: number | null }, steps: { goal_id: string; done: boolean }[]) => {
  const st = steps.filter(s => s.goal_id === g.id);
  return st.length ? Math.round((st.filter(s => s.done).length / st.length) * 100) : Number(g.completion_percentage ?? 0);
};
/** Consecutive days ending today (or yesterday if today is not done yet). */
export const streakOf = (days: Set<string>, today: string) => {
  let d = days.has(today) ? today : shift(today, -1);
  let n = 0;
  while (days.has(d)) { n += 1; d = shift(d, -1); }
  return n;
};
export const bestStreak = (days: Set<string>) => {
  let best = 0;
  for (const d of days) {
    if (days.has(shift(d, -1))) continue; // only start counting at the beginning of a run
    let n = 0;
    let x = d;
    while (days.has(x)) { n += 1; x = shift(x, 1); }
    best = Math.max(best, n);
  }
  return best;
};
export const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
/** Turn pasted text into checklist items: "1. a 2. b 3. c", one per line, or comma separated. */
export const splitItems = (text: string): string[] => {
  const t = text.trim();
  if (!t) return [];
  const numbered = t.match(/(?:^|\s)\d+[.)]\s+/g) ?? [];
  const parts = numbered.length >= 2 ? t.split(/(?:^|\s)\d+[.)]\s+/) : t.includes('\n') ? t.split(/\n+/) : t.split(/\s*,\s*/);
  return parts.map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim()).filter(Boolean);
};
