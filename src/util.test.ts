import { describe, expect, it } from 'vitest';
import { bestStreak, daysBetween, fmt, goalPct, money, monday, ord, shift, shiftMonth, splitItems, streakOf } from './util';

describe('dates', () => {
  it('shifts across month and year ends', () => {
    expect(shift('2026-10-31', 1)).toBe('2026-11-01');
    expect(shift('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('moves by months from the 1st', () => {
    expect(shiftMonth('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('finds the Monday of a week', () => {
    expect(monday('2026-10-19')).toBe('2026-10-19');
    expect(monday('2026-10-18')).toBe('2026-10-12');
    expect(monday('2026-10-21')).toBe('2026-10-19');
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-10-17', '2026-10-24')).toBe(7);
  });
  it('formats with zero padding', () => {
    expect(fmt(new Date(2026, 9, 5))).toBe('2026-10-05');
  });
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ord).join(' ')).toBe('1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 31st');
  });
});

describe('streaks', () => {
  it('counts a streak that includes today', () => {
    expect(streakOf(new Set(['2026-10-17', '2026-10-18', '2026-10-19']), '2026-10-19')).toBe(3);
  });
  it('does not break the streak when today is not done yet', () => {
    expect(streakOf(new Set(['2026-10-17', '2026-10-18']), '2026-10-19')).toBe(2);
  });
  it('is zero when the streak is broken', () => {
    expect(streakOf(new Set(['2026-10-15']), '2026-10-19')).toBe(0);
  });
  it('finds the best run', () => {
    expect(bestStreak(new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11']))).toBe(3);
    expect(bestStreak(new Set())).toBe(0);
  });
});

describe('goals and money', () => {
  it('uses the saved percentage when a goal has no steps', () => {
    expect(goalPct({ id: 'a', completion_percentage: 40 }, [])).toBe(40);
  });
  it('uses checklist steps when present', () => {
    const steps = [{ goal_id: 'a', done: true }, { goal_id: 'a', done: false }, { goal_id: 'b', done: true }];
    expect(goalPct({ id: 'a', completion_percentage: 40 }, steps)).toBe(50);
  });
  it('formats rupees the Indian way', () => {
    expect(money(1234567).replace(/ /g, ' ')).toBe('₹12,34,567');
  });
});

describe('checklist from text', () => {
  it('splits numbered lists written on one line', () => {
    expect(splitItems('1. Python Full Complete 2. JavaScript Complete 3. CSS Complete')).toEqual(['Python Full Complete', 'JavaScript Complete', 'CSS Complete']);
  });
  it('splits commas and lines', () => {
    expect(splitItems('Complete React , Python Classes , Full Risc V')).toEqual(['Complete React', 'Python Classes', 'Full Risc V']);
    expect(splitItems('- one\n- two\n\nthree')).toEqual(['one', 'two', 'three']);
    expect(splitItems('   ')).toEqual([]);
  });
});
