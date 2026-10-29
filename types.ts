export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  user_id?: string;
  title: string;
  status: string;
  priority: Priority;
  due_date: string | null;
  position: number;
}

export interface Reflection {
  id: string;
  user_id?: string;
  entry_date: string;
  daily_target: string | null;
  completed: string | null;
  learned: string | null;
  improve_tomorrow: string | null;
}

export interface Goal {
  id: string;
  user_id?: string;
  title: string;
  start_date: string;
  deadline: string;
  priority: string;
  status: string;
  completion_percentage: number;
}

export interface GoalStep { id: string; goal_id: string; title: string; done: boolean }
export interface Subject { id: string; name: string; color: string }
export interface BookRow {
  id: string; title: string; author: string | null; status: string; subject_id: string | null;
  file_path: string | null; file_name: string | null; file_type: string | null;
  total_pages: number | null; pages_read: number | null; notes: string | null;
}
export interface Expense { id: string; amount: number; category: string; note: string | null; spent_on: string; method: string | null; recurring_id?: string | null }

export interface Recurring {
  id: string; amount: number; category: string; note: string | null; method: string | null;
  day_of_month: number; active: boolean; last_month: string | null;
}
export interface BookNote { id: string; book_id: string; page: number | null; note: string; created_at: string }
export interface Habit { entry_date: string; kind: string; completed: boolean; note?: string | null }
