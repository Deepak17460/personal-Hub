import { z } from 'zod';
import { isoDateSchema, recordIdSchema } from './common';
import {
  bookmarkFieldsSchema,
  documentFieldsSchema,
  eventFieldsSchema,
  noteFieldsSchema,
  preferencesSchema,
  taskFieldsSchema,
} from './entities';

export const BACKUP_FORMAT = 'personal-hub-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_RECORDS = 50_000;

const meta = {
  id: recordIdSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  schemaVersion: z.number().int().min(1).max(1000),
};

export const exportedNoteSchema = noteFieldsSchema.extend(meta);
export const exportedTaskSchema = taskFieldsSchema.extend({ ...meta, completedAt: isoDateSchema.nullable() });
export const exportedBookmarkSchema = bookmarkFieldsSchema.extend(meta);
export const exportedDocumentSchema = documentFieldsSchema.extend(meta);
export const exportedEventSchema = eventFieldsSchema.extend(meta);

/** Unknown keys are stripped by Zod, so imported files cannot inject unexpected fields. */
export const backupSchemaV1 = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoDateSchema,
  app: z.object({ name: z.string(), version: z.string() }).optional(),
  data: z.object({
    notes: z.array(exportedNoteSchema).max(MAX_RECORDS).default([]),
    tasks: z.array(exportedTaskSchema).max(MAX_RECORDS).default([]),
    bookmarks: z.array(exportedBookmarkSchema).max(MAX_RECORDS).default([]),
    documents: z.array(exportedDocumentSchema).max(MAX_RECORDS).default([]),
    events: z.array(exportedEventSchema).max(MAX_RECORDS).default([]),
  }),
  preferences: preferencesSchema.optional(),
});

export type BackupFile = z.infer<typeof backupSchemaV1>;
export type ExportedNote = z.infer<typeof exportedNoteSchema>;
export type ExportedTask = z.infer<typeof exportedTaskSchema>;
export type ExportedBookmark = z.infer<typeof exportedBookmarkSchema>;
export type ExportedDocument = z.infer<typeof exportedDocumentSchema>;
export type ExportedEvent = z.infer<typeof exportedEventSchema>;
export type ExportedRecord = BackupFile['data'][keyof BackupFile['data']][number];

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; errors: string[] };

/** Validates a backup file. Older format versions would be migrated here before validation. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['File is larger than 50 MB.'] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (!json || typeof json !== 'object' || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This is not a Personal Hub backup file.'] };
  }
  const version = (json as { version?: unknown }).version;
  if (typeof version === 'number' && version > BACKUP_VERSION) {
    return { ok: false, errors: [`Backup version ${version} is newer than this app supports (${BACKUP_VERSION}). Update the app first.`] };
  }
  const result = backupSchemaV1.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`),
    };
  }
  return { ok: true, backup: result.data };
}
