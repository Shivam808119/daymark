import type { Task } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in the user's local time zone. */
export function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function taskProgress(tasks: Pick<Task, 'status'>[]) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'done').length;
  return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
}
