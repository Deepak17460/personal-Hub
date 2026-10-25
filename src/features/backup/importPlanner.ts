import type { BackupFile, ExportedRecord } from '@/schemas/backup';
import { COLLECTIONS, type CollectionName } from '@/types/models';
import { randomId } from '@/utils/ids';
import { canonicalUrl } from '@/utils/url';

/**
 * - skip:      keep existing records when the same ID already exists (safe default)
 * - newer:     replace existing records only if the backup copy was updated later
 * - overwrite: always replace existing records with the backup copy
 * - duplicate: keep both; conflicting backup records get a new ID
 * Content duplicates (same item under a different ID, e.g. the same bookmark URL) are skipped
 * except in "duplicate" mode.
 */
export type ImportStrategy = 'skip' | 'newer' | 'overwrite' | 'duplicate';

export interface ExistingRecord {
  id: string;
  updatedAt: Date;
  [key: string]: unknown;
}

export type ImportOp =
  | { kind: 'create'; collection: CollectionName; record: ExportedRecord }
  | { kind: 'replace'; collection: CollectionName; record: ExportedRecord; existing: ExistingRecord };

export interface CollectionSummary {
  create: number;
  replace: number;
  skippedSameId: number;
  skippedDuplicate: number;
}

export interface ImportPlan {
  ops: ImportOp[];
  summary: Record<CollectionName, CollectionSummary>;
}

export function contentKey(collection: CollectionName, r: Record<string, unknown>): string {
  const s = (k: string) => String(r[k] ?? '').trim().toLowerCase();
  switch (collection) {
    case 'bookmarks':
      return `b|${canonicalUrl(String(r.url ?? ''))}`;
    case 'notes':
      return `n|${s('title')}|${s('content')}`;
    case 'tasks':
      return `t|${s('title')}|${s('dueDate')}|${s('status')}`;
    case 'documents':
      return `d|${s('title')}|${s('externalUrl')}`;
    case 'events':
      return `e|${s('title')}|${s('date')}|${s('time')}`;
  }
}

export function planImport(
  backup: BackupFile,
  existing: Record<CollectionName, ExistingRecord[]>,
  strategy: ImportStrategy,
  makeId: () => string = randomId,
): ImportPlan {
  const ops: ImportOp[] = [];
  const summary = {} as Record<CollectionName, CollectionSummary>;

  for (const collection of COLLECTIONS) {
    const s: CollectionSummary = { create: 0, replace: 0, skippedSameId: 0, skippedDuplicate: 0 };
    summary[collection] = s;
    const byId = new Map(existing[collection].map((r) => [r.id, r]));
    const contentKeys = new Set(existing[collection].map((r) => contentKey(collection, r)));
    const seenIds = new Set<string>();

    for (const record of backup.data[collection] as ExportedRecord[]) {
      if (seenIds.has(record.id) && strategy !== 'duplicate') {
        s.skippedSameId++;
        continue;
      }
      seenIds.add(record.id);
      const current = byId.get(record.id);
      const key = contentKey(collection, record as unknown as Record<string, unknown>);

      if (current) {
        if (strategy === 'skip') {
          s.skippedSameId++;
        } else if (strategy === 'newer') {
          if (new Date(record.updatedAt) > current.updatedAt) {
            ops.push({ kind: 'replace', collection, record, existing: current });
            s.replace++;
          } else {
            s.skippedSameId++;
          }
        } else if (strategy === 'overwrite') {
          ops.push({ kind: 'replace', collection, record, existing: current });
          s.replace++;
        } else {
          ops.push({ kind: 'create', collection, record: { ...record, id: makeId() } });
          s.create++;
        }
        continue;
      }

      if (strategy !== 'duplicate' && contentKeys.has(key)) {
        s.skippedDuplicate++;
        continue;
      }
      contentKeys.add(key);
      ops.push({ kind: 'create', collection, record });
      s.create++;
    }
  }
  return { ops, summary };
}
