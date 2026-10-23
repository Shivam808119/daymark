import { useCallback, useEffect, useState } from 'react';
import { listOn, saveOwned } from './lib/api';
import { HABITS, failure } from './util';

type Habit = { kind: string; completed: boolean; note?: string | null };

/** Daily workout + meals checklist. One row per day and habit in `daily_habits`. */
export function WellnessCard({ date }: { date: string }) {
  const [rows, setRows] = useState<Habit[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await listOn<Habit>('daily_habits', date);
      setRows(r);
      setNote(r.find(x => x.kind === 'workout')?.note ?? '');
      setErr('');
    } catch (e) {
      setErr(failure(e));
    }
  }, [date]);

  useEffect(() => {
    setRows([]);
    setNote('');
    void load();
  }, [load]);

  const get = (k: string) => rows.find(r => r.kind === k);

  async function save(kind: string, completed: boolean, n?: string | null) {
    setRows(prev => [...prev.filter(r => r.kind !== kind), { kind, completed, note: n ?? null }]);
    try {
      await saveOwned('daily_habits', { entry_date: date, kind, completed, note: n ?? null }, 'user_id,entry_date,kind');
    } catch (e) {
      setErr(failure(e));
      void load();
    }
  }

  const done = HABITS.filter(h => get(h.kind)?.completed).length;
  const workout = get('workout');

  return (
    <article className="wellness-card">
      <p className="kicker">Daily wellness</p>
      <h2>Body &amp; food</h2>
      <div className="meter" style={{ margin: '4px 0 6px' }}><i style={{ width: `${(done / HABITS.length) * 100}%` }} /></div>
      <small className="wl-count">{done} of {HABITS.length} done {done === HABITS.length ? '🎉' : ''}</small>

      <button type="button" className={`habit big ${workout?.completed ? 'on' : ''}`} onClick={() => void save('workout', !workout?.completed, note)}>
        <span className="hb">{workout?.completed ? '✓' : ''}</span>
        <span>💪 Did you work out today?</span>
      </button>
      <input
        className="habit-note"
        placeholder="What did you do? (gym, run, yoga, 30 min walk…)"
        value={note}
        onChange={e => setNote(e.target.value)}
        onBlur={() => { if (note !== (workout?.note ?? '')) void save('workout', !!workout?.completed, note); }}
      />

      <p className="kicker" style={{ margin: '18px 0 8px' }}>Have you eaten?</p>
      <div className="meals">
        {HABITS.filter(h => h.kind !== 'workout').map(h => {
          const on = !!get(h.kind)?.completed;
          return (
            <button type="button" key={h.kind} className={`habit ${on ? 'on' : ''}`} onClick={() => void save(h.kind, !on)}>
              <span className="hb">{on ? '✓' : ''}</span>
              <span>{h.icon} {h.label}</span>
            </button>
          );
        })}
      </div>
      {err && <small className="error">{err}</small>}
    </article>
  );
}
