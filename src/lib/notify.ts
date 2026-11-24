export type ToastKind = 'ok' | 'error';

/** Show a small message at the bottom of the screen (rendered by <Toaster /> in ui.tsx). */
export function notify(msg: string, kind: ToastKind = 'ok') {
  window.dispatchEvent(new CustomEvent('daymark-toast', { detail: { msg, kind } }));
}

/** Turn raw database errors into something a person can act on. */
export function friendly(m: string): string {
  if (/does not exist|schema cache|Could not find/i.test(m)) return `${m} — run the SQL setup file in Supabase first.`;
  if (/check constraint/i.test(m)) return `${m} — your database does not allow this value.`;
  if (/row-level security|JWT|not authenticated/i.test(m)) return 'Not allowed — please sign out and sign in again.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No internet connection. Your change was not saved.';
  return m;
}
