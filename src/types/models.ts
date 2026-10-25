export type CollectionName = 'notes' | 'tasks' | 'bookmarks' | 'documents' | 'events';

export const COLLECTIONS: readonly CollectionName[] = ['notes', 'tasks', 'bookmarks', 'documents', 'events'];

export interface BaseRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  schemaVersion: number;
  /** True while this record has local changes not yet acknowledged by the server. */
  pending?: boolean;
  searchTokens?: string[];
}

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
}

export interface NoteFields {
  title: string;
  content: string;
  category: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
}
export interface Note extends BaseRecord, NoteFields {
  /** Revision chain used for optimistic concurrency (enforced by Firestore rules). */
  revId: string;
  prevRevId: string | null;
}

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}
export interface TaskFields {
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  category: string;
  tags: string[];
  subtasks: Subtask[];
  recurrence: Recurrence;
}
export interface Task extends BaseRecord, TaskFields {
  completedAt: Date | null;
}

export interface BookmarkFields {
  url: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  favorite: boolean;
}
export interface Bookmark extends BaseRecord, BookmarkFields {}

export interface DocumentFields {
  title: string;
  description: string;
  category: string;
  tags: string[];
  externalUrl: string | null;
  storageProvider: string;
  fileType: string;
  fileSizeBytes: number | null;
}
export interface DocumentRecord extends BaseRecord, DocumentFields {}

export type EventKind = 'event' | 'important' | 'reminder';
export interface EventFields {
  title: string;
  description: string;
  date: string;
  time: string | null;
  kind: EventKind;
  recurrence: Recurrence;
  /** Minutes before the start (all-day items use 09:00 local). null = no reminder. */
  reminderMinutes: number | null;
}
export interface CalendarEvent extends BaseRecord, EventFields {}

export type ThemePreference = 'light' | 'dark' | 'system';
export type DashboardWidget =
  | 'tasks'
  | 'reminders'
  | 'notes'
  | 'bookmarks'
  | 'recent'
  | 'stats'
  | 'quickActions'
  | 'sync';

export interface Preferences {
  theme: ThemePreference;
  notificationsEnabled: boolean;
  weekStartsOn: 0 | 1;
  dashboardWidgets: Record<DashboardWidget, boolean>;
  schemaVersion: number;
}

export type RecordOf<C extends CollectionName> = C extends 'notes'
  ? Note
  : C extends 'tasks'
    ? Task
    : C extends 'bookmarks'
      ? Bookmark
      : C extends 'documents'
        ? DocumentRecord
        : CalendarEvent;
