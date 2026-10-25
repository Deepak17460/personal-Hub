import type { NoteFields } from '@/types/models';

/** Notes created by "New note" in this tab that have not been given any content yet. */
const fresh = new Set<string>();
const pendingDiscards = new Map<string, ReturnType<typeof setTimeout>>();

export function markFresh(id: string): void {
  fresh.add(id);
}

export function isFresh(id: string): boolean {
  return fresh.has(id);
}

export function isBlankNote(fields: NoteFields): boolean {
  return !fields.title.trim() && !fields.content.trim() && fields.tags.length === 0 && !fields.pinned;
}

/**
 * Deletes a fresh, still-blank note after the editor closes. Deferred by a tick so that an
 * immediate remount of the same note (React StrictMode) can cancel it via `cancelDiscard`.
 */
export function scheduleDiscard(id: string, discard: () => void): void {
  cancelDiscard(id);
  pendingDiscards.set(
    id,
    setTimeout(() => {
      pendingDiscards.delete(id);
      fresh.delete(id);
      discard();
    }, 0),
  );
}

export function cancelDiscard(id: string): void {
  const t = pendingDiscards.get(id);
  if (t !== undefined) {
    clearTimeout(t);
    pendingDiscards.delete(id);
  }
}
