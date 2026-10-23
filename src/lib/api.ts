import { friendly, notify } from './notify';
import { supabase } from './supabase';
import type { Goal, Reflection, Task } from './types';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function userId(): Promise<string> {
  const { data, error } = await client().auth.getUser();
  if (error || !data.user) throw new Error('Please sign in again.');
  return data.user.id;
}

function fail(message: string): never {
  notify(friendly(message), 'error');
  throw new Error(message);
}

const clean = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));

/** Read every row the signed-in user owns (RLS enforces ownership). */
export async function listOwned<T>(table: string): Promise<T[]> {
  const { data, error } = await client().from(table).select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/** Insert or update a row owned by the signed-in user. */
export async function saveOwned(table: string, values: Record<string, unknown>, onConflict?: string) {
  let row: Record<string, unknown>;
  try { row = clean({ ...values, user_id: await userId() }); } catch (e) { return fail(e instanceof Error ? e.message : 'Please sign in again.'); }
  const query = client().from(table);
  const { error } = onConflict || row.id ? await query.upsert(row, onConflict ? { onConflict } : undefined) : await query.insert(row);
  if (error) fail(error.message);
  notify('Saved ✓');
}

/** Change only the given columns of one row (safer than re-saving the whole row). */
export async function updateOwned(table: string, id: string, patch: Record<string, unknown>, quiet = false) {
  const { error } = await client().from(table).update(clean(patch)).eq('id', id);
  if (error) fail(error.message);
  if (!quiet) notify('Saved ✓');
}

/** Save many rows at once without a toast (used by backup import and automatic bills). */
export async function upsertMany(table: string, rows: Record<string, unknown>[], onConflict = 'id', ignoreDuplicates = false): Promise<number> {
  if (!rows.length) return 0;
  const uid = await userId();
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map(r => clean({ ...r, user_id: uid }));
    const { error } = await client().from(table).upsert(chunk, { onConflict, ignoreDuplicates });
    if (error) throw new Error(error.message);
    n += chunk.length;
  }
  return n;
}

/* ---------- tasks ---------- */
export async function getTasks(date: string): Promise<Task[]> {
  const { data, error } = await client().from('tasks').select('*').eq('due_date', date).order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function saveTask(task: Partial<Task> & { title: string }) {
  await saveOwned('tasks', task);
}

export async function removeTask(id: string) {
  const { error } = await client().from('tasks').delete().eq('id', id);
  if (error) fail(error.message);
  notify('Deleted');
}

/* ---------- reflections ---------- */
export async function getReflection(date: string): Promise<Reflection | null> {
  const { data, error } = await client().from('daily_reflections').select('*').eq('entry_date', date).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Reflection | null;
}

export async function saveReflection(r: Partial<Reflection> & { entry_date: string }) {
  await saveOwned('daily_reflections', r, 'user_id,entry_date');
}

/* ---------- goals ---------- */
export async function getGoals(): Promise<Goal[]> {
  const { data, error } = await client().from('goals').select('*').order('deadline', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Goal[];
}

export async function saveGoal(goal: Partial<Goal> & { title: string }) {
  await saveOwned('goals', goal);
}

/* ---------- generic helpers used by newer pages ---------- */
export async function listOn<T>(table: string, date: string): Promise<T[]> {
  const { data, error } = await client().from(table).select('*').eq('entry_date', date);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export async function listBy<T>(table: string, column: string, value: string): Promise<T[]> {
  const { data, error } = await client().from(table).select('*').eq(column, value);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export async function removeOwned(table: string, id: string) {
  const { error } = await client().from(table).delete().eq('id', id);
  if (error) fail(error.message);
  notify('Deleted');
}

/* ---------- private file storage for books ---------- */
const BUCKET = 'books';

export async function uploadBookFile(file: File): Promise<string> {
  const uid = await userId();
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${uid}/${Date.now()}-${safe}`;
  const { error } = await client().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function bookFileUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error(error?.message ?? 'Could not open the file.');
  return data.signedUrl;
}

export async function removeBookFile(path: string) {
  const { error } = await client().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
