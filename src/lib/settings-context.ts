import { createContext, useContext } from 'react';
import { DEFAULTS } from './settings-core';
import type { Settings } from './settings-core';

export type SettingsApi = { s: Settings; update: (patch: Partial<Settings>) => void; reset: () => void };
export const SettingsCtx = createContext<SettingsApi>({ s: DEFAULTS, update: () => undefined, reset: () => undefined });
export const useSettings = () => useContext(SettingsCtx);
