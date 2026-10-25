import { describe, expect, it } from 'vitest';
import {
  bookmarkFieldsSchema,
  bookmarkFormSchema,
  documentFormSchema,
  eventFieldsSchema,
  noteFieldsSchema,
  taskFieldsSchema,
} from '@/schemas/entities';
import { dedupeTags } from '@/schemas/common';
import { signUpSchema } from '@/features/auth/authSchemas';
import { toBookmarkFields } from '@/features/bookmarks/BookmarkForm';
import { toDocumentFields } from '@/features/documents/DocumentForm';
import { toEventFields } from '@/features/calendar/EventForm';
import { toTaskFields } from '@/features/tasks/TaskForm';
import { EMPTY_TASK } from '@/repositories/tasks';

describe('entity schemas', () => {
  it('validates notes and rejects oversize content', () => {
    const note = { title: 'Hi', content: 'x', category: '', tags: [], pinned: false, archived: false };
    expect(noteFieldsSchema.safeParse(note).success).toBe(true);
    expect(noteFieldsSchema.safeParse({ ...note, content: 'x'.repeat(100_001) }).success).toBe(false);
    expect(noteFieldsSchema.safeParse({ ...note, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it('requires task titles and valid due dates', () => {
    expect(taskFieldsSchema.safeParse({ ...EMPTY_TASK, title: '' }).success).toBe(false);
    expect(taskFieldsSchema.safeParse({ ...EMPTY_TASK, title: 'Pay rent', dueDate: '2024-02-30' }).success).toBe(false);
    expect(taskFieldsSchema.safeParse({ ...EMPTY_TASK, title: 'Pay rent', dueDate: '2024-02-29', priority: 'critical' }).success).toBe(true);
    expect(taskFieldsSchema.safeParse({ ...EMPTY_TASK, title: 'x', priority: 'urgent' }).success).toBe(false);
  });

  it('only stores safe bookmark URLs', () => {
    const base = { title: 'X', description: '', category: '', tags: [], favorite: false };
    expect(bookmarkFieldsSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(bookmarkFieldsSchema.safeParse({ ...base, url: 'https://ok.dev' }).success).toBe(true);
    expect(bookmarkFormSchema.safeParse({ ...base, url: 'ok.dev' }).success).toBe(true);
    expect(bookmarkFormSchema.safeParse({ ...base, url: 'data:text/html,hi' }).success).toBe(false);
  });

  it('validates event times and reminder bounds', () => {
    const base = { title: 'E', description: '', date: '2024-01-01', time: null, kind: 'event', recurrence: { freq: 'none', interval: 1 }, reminderMinutes: null };
    expect(eventFieldsSchema.safeParse(base).success).toBe(true);
    expect(eventFieldsSchema.safeParse({ ...base, time: '24:00' }).success).toBe(false);
    expect(eventFieldsSchema.safeParse({ ...base, reminderMinutes: -5 }).success).toBe(false);
  });

  it('dedupes tags case-insensitively', () => {
    expect(dedupeTags(['Work', 'work ', ' home', '', 'Home'])).toEqual(['Work', 'home']);
  });

  it('enforces a strong password and matching confirmation on sign-up', () => {
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'short', confirm: 'short' }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'a-long-passphrase', confirm: 'different-phrase' }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'a-long-passphrase', confirm: 'a-long-passphrase' }).success).toBe(true);
  });
});

describe('form conversion', () => {
  it('converts task form values', () => {
    const fields = toTaskFields({ ...EMPTY_TASK, title: '  Buy milk ', dueDate: '', subtasks: [{ id: 'a', title: ' ', done: false }] });
    expect(fields.title).toBe('Buy milk');
    expect(fields.dueDate).toBeNull();
    expect(fields.subtasks).toHaveLength(0);
  });

  it('normalises bookmark URLs and default titles', () => {
    const fields = toBookmarkFields({ url: 'www.example.com/x', title: '', description: '', category: '', tags: [], favorite: true });
    expect(fields.url).toBe('https://www.example.com/x');
    expect(fields.title).toBe('example.com');
  });

  it('converts document size in MB to bytes and empty links to null', () => {
    const values = { title: 'Passport', description: '', category: '', tags: [], storageProvider: 'OneDrive', fileType: 'PDF', externalUrl: '', fileSizeMb: '1.5' };
    expect(documentFormSchema.safeParse(values).success).toBe(true);
    const fields = toDocumentFields(values);
    expect(fields.fileSizeBytes).toBe(1_572_864);
    expect(fields.externalUrl).toBeNull();
    expect(documentFormSchema.safeParse({ ...values, externalUrl: 'javascript:void(0)' }).success).toBe(false);
  });

  it('converts event reminders', () => {
    const fields = toEventFields({ title: 'X', description: '', date: '2024-01-01', time: '', kind: 'reminder', recurrence: { freq: 'none', interval: 1 }, reminder: '60' });
    expect(fields.time).toBeNull();
    expect(fields.reminderMinutes).toBe(60);
  });
});
