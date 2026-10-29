import { store } from '../util';

export type HabitGroup = 'body' | 'food';
export type HabitDef = { kind: string; label: string; icon: string; group: HabitGroup };
export type Show = { wellness: boolean; mood: boolean; intention: boolean; strip: boolean; weekly: boolean; books: boolean; expenses: boolean };
export type Settings = { name: string; habits: HabitDef[]; show: Show };

export const DEFAULT_HABITS: HabitDef[] = [
  { kind: 'workout', label: 'Did you work out today?', icon: '💪', group: 'body' },
  { kind: 'breakfast', label: 'Breakfast', icon: '🍳', group: 'food' },
  { kind: 'lunch', label: 'Lunch', icon: '🍛', group: 'food' },
  { kind: 'dinner', label: 'Dinner', icon: '🍲', group: 'food' },
];
export const DEFAULT_SHOW: Show = { wellness: true, mood: true, intention: true, strip: true, weekly: true, books: true, expenses: true };
export const DEFAULTS: Settings = { name: 'Shivam', habits: DEFAULT_HABITS, show: DEFAULT_SHOW };

export const SETTINGS_KEY = 'daymark-settings';

/** Accept whatever was saved before and turn it into a complete, valid Settings object. */
export function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const show = { ...DEFAULT_SHOW };
  if (r.show && typeof r.show === 'object') {
    for (const k of Object.keys(show) as (keyof Show)[]) {
      const v = (r.show as Record<string, unknown>)[k];
      if (typeof v === 'boolean') show[k] = v;
    }
  }
  let habits = DEFAULT_HABITS;
  if (Array.isArray(r.habits)) {
    const seen = new Set<string>();
    habits = r.habits.flatMap((h): HabitDef[] => {
      const x = h as Partial<HabitDef> | null;
      if (!x || typeof x.kind !== 'string' || !x.kind || typeof x.label !== 'string' || seen.has(x.kind)) return [];
      seen.add(x.kind);
      return [{ kind: x.kind, label: x.label.slice(0, 60), icon: typeof x.icon === 'string' ? x.icon.slice(0, 8) : '✅', group: x.group === 'body' ? 'body' : 'food' }];
    });
  }
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : DEFAULTS.name;
  return { name, habits, show };
}

export function readLocal(): Settings {
  try {
    const t = store.get(SETTINGS_KEY);
    return t ? mergeSettings(JSON.parse(t)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
