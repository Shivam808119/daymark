import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadSettings, saveSettings } from './api';
import { notify } from './notify';
import { SettingsCtx } from './settings-context';
import { DEFAULTS, SETTINGS_KEY, mergeSettings, readLocal } from './settings-core';
import type { Settings } from './settings-core';
import { store } from '../util';

/**
 * Personal preferences (your name, which cards and pages are shown, the wellness list).
 * Saved to the `app_settings` table so they follow you to every device, and also kept on this
 * device so the app still works if that table has not been created yet.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(readLocal);
  const cur = useRef(s);
  const warned = useRef(false);

  useEffect(() => {
    let alive = true;
    loadSettings()
      .then(raw => {
        if (!alive || !raw) return;
        const m = mergeSettings(raw);
        cur.current = m;
        setS(m);
        store.set(SETTINGS_KEY, JSON.stringify(m));
      })
      .catch(() => undefined); // table not created yet: keep using this device's copy
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next: Settings) => {
    cur.current = next;
    setS(next);
    store.set(SETTINGS_KEY, JSON.stringify(next));
    saveSettings(next as unknown as Record<string, unknown>)
      .then(() => notify('Saved ✓'))
      .catch(() => {
        if (warned.current) return;
        warned.current = true;
        notify('Saved on this device only. Run the new SQL file in Supabase to keep it on every device.', 'error');
      });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => persist({ ...cur.current, ...patch }), [persist]);
  const reset = useCallback(() => persist(DEFAULTS), [persist]);
  const value = useMemo(() => ({ s, update, reset }), [s, update, reset]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}
