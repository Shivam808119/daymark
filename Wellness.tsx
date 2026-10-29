import { useCallback, useEffect, useState } from 'react';
import { listOn, saveOwned } from './lib/api';
import { useSettings } from './lib/settings-context';
import type { HabitDef, HabitGroup } from './lib/settings-core';
import { failure } from './util';

type Habit = { kind: string; completed: boolean; note?: string | null };

/** Daily checklist (workout, meals, anything you add). One row per day and item in `daily_habits`. */
export function WellnessCard({ date }: { date: string }) {
  const { s, update } = useSettings();
  const habits = s.habits;
  const [rows, setRows] = useState<Habit[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listOn<Habit>('daily_habits', date);
      setRows(r);
      setNotes(Object.fromEntries(r.map(x => [x.kind, x.note ?? ''])));
      setErr('');
    } catch (e) {
      setErr(failure(e));
    }
  }, [date]);

  useEffect(() => {
    setRows([]);
    setNotes({});
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

  const done = habits.filter(h => get(h.kind)?.completed).length;
  const body = habits.filter(h => h.group === 'body');
  const food = habits.filter(h => h.group === 'food');

  if (editing) {
    return (
      <WellnessEditor
        start={habits}
        onSave={list => { update({ habits: list }); setEditing(false); }}
        onCancel={() => setEditing(false)}
        onHide={() => { update({ show: { ...s.show, wellness: false } }); setEditing(false); }}
      />
    );
  }

  return (
    <article className="wellness-card">
      <div className="wl-head">
        <p className="kicker">Daily wellness</p>
        <button type="button" className="plain wl-edit" onClick={() => setEditing(true)}>✎ Customize</button>
      </div>
      <h2>Body &amp; food</h2>
      {habits.length > 0 ? (
        <>
          <div className="meter" style={{ margin: '4px 0 6px' }}><i style={{ width: `${(done / habits.length) * 100}%` }} /></div>
          <small className="wl-count">{done} of {habits.length} done {done === habits.length ? '🎉' : ''}</small>
        </>
      ) : (
        <p className="empty" style={{ margin: '8px 0 0' }}>Nothing here yet. Tap “Customize” to add the things you want to track every day.</p>
      )}

      {body.map(h => {
        const row = get(h.kind);
        const note = notes[h.kind] ?? '';
        return (
          <div key={h.kind}>
            <button type="button" className={`habit big ${row?.completed ? 'on' : ''}`} onClick={() => void save(h.kind, !row?.completed, note)}>
              <span className="hb">{row?.completed ? '✓' : ''}</span>
              <span>{h.icon} {h.label}</span>
            </button>
            <input
              className="habit-note"
              placeholder="Add a note (what you did, how it went…)"
              value={note}
              onChange={e => setNotes(p => ({ ...p, [h.kind]: e.target.value }))}
              onBlur={() => { if (note !== (row?.note ?? '')) void save(h.kind, !!row?.completed, note); }}
            />
          </div>
        );
      })}

      {food.length > 0 && (
        <>
          <p className="kicker" style={{ margin: '18px 0 8px' }}>Have you eaten?</p>
          <div className="meals">
            {food.map(h => {
              const on = !!get(h.kind)?.completed;
              return (
                <button type="button" key={h.kind} className={`habit ${on ? 'on' : ''}`} onClick={() => void save(h.kind, !on)}>
                  <span className="hb">{on ? '✓' : ''}</span>
                  <span>{h.icon} {h.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {err && <small className="error">{err}</small>}
    </article>
  );
}

/** Rename, delete and add the items of the wellness card. Nothing is saved until you press Save. */
function WellnessEditor({ start, onSave, onCancel, onHide }: {
  start: HabitDef[]; onSave: (list: HabitDef[]) => void; onCancel: () => void; onHide: () => void;
}) {
  const [list, setList] = useState<HabitDef[]>(start);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('✅');
  const [group, setGroup] = useState<HabitGroup>('body');

  const patch = (kind: string, p: Partial<HabitDef>) => setList(l => l.map(h => (h.kind === kind ? { ...h, ...p } : h)));
  function add() {
    const name = label.trim();
    if (!name) return;
    setList(l => [...l, { kind: `c-${Date.now().toString(36)}`, label: name, icon: icon.trim() || '✅', group }]);
    setLabel('');
  }
  const clean = () => list.map(h => ({ ...h, label: h.label.trim() })).filter(h => h.label);

  return (
    <article className="wellness-card wl-editor">
      <p className="kicker">Customize wellness</p>
      <h2>Your daily list</h2>
      <p className="wl-help">Rename or delete items, or add your own (water, vitamins, reading…). Old days keep what you already ticked.</p>

      <div className="wl-rows">
        {list.map(h => (
          <div className="wl-row" key={h.kind}>
            <input className="wl-icon" value={h.icon} maxLength={4} aria-label="Emoji" onChange={e => patch(h.kind, { icon: e.target.value })} />
            <input className="wl-name" value={h.label} maxLength={60} aria-label="Name" onChange={e => patch(h.kind, { label: e.target.value })} />
            <select value={h.group} aria-label="Type" onChange={e => patch(h.kind, { group: e.target.value as HabitGroup })}>
              <option value="body">With note</option>
              <option value="food">Quick tick</option>
            </select>
            <button type="button" className="plain" aria-label={`Delete ${h.label}`} onClick={() => setList(l => l.filter(x => x.kind !== h.kind))}>Delete</button>
          </div>
        ))}
        {!list.length && <small>The list is empty. Add your first item below.</small>}
      </div>

      <div className="wl-add">
        <input className="wl-icon" value={icon} maxLength={4} aria-label="Emoji" onChange={e => setIcon(e.target.value)} />
        <input className="wl-name" value={label} maxLength={60} placeholder="New item, e.g. Drink 3 litres of water" onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <select value={group} aria-label="Type" onChange={e => setGroup(e.target.value as HabitGroup)}>
          <option value="body">With note</option>
          <option value="food">Quick tick</option>
        </select>
        <button type="button" className="chip on" onClick={add}>+ Add</button>
      </div>

      <div className="wl-actions">
        <button type="button" className="btn" onClick={() => onSave(clean())}>Save changes</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="plain" onClick={() => { if (window.confirm('Hide the Daily wellness card? You can bring it back in Settings.')) onHide(); }}>Hide this card</button>
      </div>
    </article>
  );
}
