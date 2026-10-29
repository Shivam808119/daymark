import { describe, expect, it } from 'vitest';
import { DEFAULTS, DEFAULT_HABITS, mergeSettings } from './settings-core';

describe('settings', () => {
  it('falls back to defaults for missing or broken data', () => {
    expect(mergeSettings(null)).toEqual(DEFAULTS);
    expect(mergeSettings('oops').habits).toEqual(DEFAULT_HABITS);
    expect(mergeSettings({ habits: 5, show: 7 }).show).toEqual(DEFAULTS.show);
  });
  it('keeps a customised list and drops duplicates and bad rows', () => {
    const m = mergeSettings({ name: '  Asha ', habits: [{ kind: 'water', label: 'Water', icon: '💧', group: 'food' }, { kind: 'water', label: 'again' }, { label: 'no kind' }, null] });
    expect(m.name).toBe('Asha');
    expect(m.habits).toEqual([{ kind: 'water', label: 'Water', icon: '💧', group: 'food' }]);
  });
  it('allows an empty list and ignores bad switch values', () => {
    const m = mergeSettings({ habits: [], show: { books: false, mood: 'no' } });
    expect(m.habits).toEqual([]);
    expect(m.show.books).toBe(false);
    expect(m.show.mood).toBe(true);
  });
});
