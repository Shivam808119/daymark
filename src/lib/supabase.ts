import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const looksReal = (v: string | undefined) => !!v && !/YOUR|PLACEHOLDER|<.*>/i.test(v);

export const isConfigured = looksReal(url) && looksReal(key);
export const supabase = isConfigured ? createClient(url!, key!) : null;
