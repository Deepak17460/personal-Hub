import { z } from 'zod';
import {
  LIMITS,
  categorySchema,
  dateStrSchema,
  httpUrlInputSchema,
  optionalHttpUrlInputSchema,
  recurrenceSchema,
  storedHttpUrlSchema,
  tagsSchema,
  timeStrSchema,
} from './common';

// ---------- Field schemas (shared by forms, repositories and import validation) ----------

export const noteFieldsSchema = z.object({
  title: z.string().trim().max(LIMITS.title),
  content: z.string().max(LIMITS.noteContent, 'Note is too long'),
  category: categorySchema,
  tags: tagsSchema,
  pinned: z.boolean(),
  archived: z.boolean(),
});

export const subtaskSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  title: z.string().trim().min(1).max(LIMITS.title),
  done: z.boolean(),
});

export const priorityValues = ['low', 'medium', 'high', 'critical'] as const;
export const taskStatusValues = ['todo', 'in_progress', 'done'] as const;

export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(LIMITS.title),
  description: z.string().max(LIMITS.description),
  priority: z.enum(priorityValues),
  status: z.enum(taskStatusValues),
  dueDate: dateStrSchema.nullable(),
  category: categorySchema,
  tags: tagsSchema,
  subtasks: z.array(subtaskSchema).max(LIMITS.subtasks),
  recurrence: recurrenceSchema,
});

export const bookmarkFieldsSchema = z.object({
  url: storedHttpUrlSchema,
  title: z.string().trim().min(1, 'Title is required').max(LIMITS.title),
  description: z.string().max(LIMITS.description),
  category: categorySchema,
  tags: tagsSchema,
  favorite: z.boolean(),
});

export const documentFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(LIMITS.title),
  description: z.string().max(LIMITS.description),
  category: categorySchema,
  tags: tagsSchema,
  externalUrl: storedHttpUrlSchema.nullable(),
  storageProvider: z.string().trim().max(60),
  fileType: z.string().trim().max(60),
  fileSizeBytes: z.number().int().min(0).max(10 ** 13).nullable(),
});

export const eventKindValues = ['event', 'important', 'reminder'] as const;

export const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(LIMITS.title),
  description: z.string().max(LIMITS.description),
  date: dateStrSchema,
  time: timeStrSchema.nullable(),
  kind: z.enum(eventKindValues),
  recurrence: recurrenceSchema,
  reminderMinutes: z.number().int().min(0).max(43_200).nullable(),
});

// ---------- Form schemas (UI input shape; converted to field shape on submit) ----------

/** Title may be left empty in the form; it then defaults to the URL's hostname. */
export const bookmarkFormSchema = bookmarkFieldsSchema.extend({
  url: httpUrlInputSchema,
  title: z.string().trim().max(LIMITS.title),
});
export type BookmarkFormValues = z.infer<typeof bookmarkFormSchema>;

export const documentFormSchema = documentFieldsSchema.omit({ externalUrl: true, fileSizeBytes: true }).extend({
  externalUrl: optionalHttpUrlInputSchema,
  fileSizeMb: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+(\.\d+)?$/.test(v) && Number(v) <= 10_000_000), 'Enter a size in MB, e.g. 2.5'),
});
export type DocumentFormValues = z.infer<typeof documentFormSchema>;

export const taskFormSchema = taskFieldsSchema.omit({ dueDate: true }).extend({
  dueDate: z.string().refine((v) => v === '' || dateStrSchema.safeParse(v).success, 'Invalid date'),
});
export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const eventFormSchema = eventFieldsSchema.omit({ time: true, reminderMinutes: true }).extend({
  time: z.string().refine((v) => v === '' || timeStrSchema.safeParse(v).success, 'Use the format HH:MM'),
  reminder: z.enum(['none', '0', '10', '30', '60', '1440', '10080']),
});
export type EventFormValues = z.infer<typeof eventFormSchema>;

export const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  notificationsEnabled: z.boolean(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  dashboardWidgets: z.object({
    tasks: z.boolean(),
    reminders: z.boolean(),
    notes: z.boolean(),
    bookmarks: z.boolean(),
    recent: z.boolean(),
    stats: z.boolean(),
    quickActions: z.boolean(),
    sync: z.boolean(),
  }),
  schemaVersion: z.number().int(),
});
