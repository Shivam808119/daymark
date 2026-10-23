import { useEffect, useMemo, useState } from 'react';
import { listOwned } from './lib/api';
import { isoToday } from './lib/planning';
import type { Habit } from './lib/types';
import { bestStreak, shift, streakOf } from './util';

const MEALS = ['breakfast', 'lunch', 'dinner'];

/** Workout and meal streaks plus a 5-week grid. Shown on the Review page. */
export function HabitsPanel() {
  const [rows, setRows] = useState<Habit[]>([]);
  useEffect(() => { listOwned<Habit>('daily_habits').then(setRows).catch(() => undefined); }, []);
  const today = isoToday();

  const d = useMemo(() => {
    const workout = new Set(rows.filter(r => r.kind === 'workout' && r.completed).map(r => r.entry_date));
    const meals = new Map<string, number>();
    rows.filter(r => MEALS.includes(r.kind) && r.completed).forEach(r => meals.set(r.entry_date, (meals.get(r.entry_date) ?? 0) + 1));
    const fullMeals = new Set([...meals].filter(([, n]) => n >= 3).map(([k]) => k));
    const days = Array.from({ length: 35 }, (_, i) => shift(today, i - 34));
    return {
      workout, meals, days,
      wStreak: streakOf(workout, today), wBest: bestStreak(workout), mStreak: streakOf(fullMeals, today),
      w30: days.slice(5).filter(x => workout.has(x)).length,
    };
  }, [rows, today]);

  return (
    <article className="panel">
      <h2>Habits</h2>
      <div className="hab-stats">
        <div><b>{d.wStreak}</b><span>workout streak 🔥</span></div>
        <div><b>{d.wBest}</b><span>best streak</span></div>
        <div><b>{d.w30}</b><span>workouts / 30 days</span></div>
        <div><b>{d.mStreak}</b><span>full-meals streak</span></div>
      </div>
      <p className="kicker" style={{ margin: '16px 0 4px' }}>Workout · last 5 weeks</p>
      <div className="heat">
        {d.days.map(x => <i key={x} className={`${d.workout.has(x) ? 'l3' : ''} ${x === today ? 'now' : ''}`} title={x} />)}
      </div>
      <p className="kicker" style={{ margin: '14px 0 4px' }}>Meals eaten (0–3 a day)</p>
      <div className="heat">
        {d.days.map(x => { const n = d.meals.get(x) ?? 0; return <i key={x} className={`${n ? `l${Math.min(3, n)}` : ''} ${x === today ? 'now' : ''}`} title={`${x}: ${n}/3`} />; })}
      </div>
    </article>
  );
}
