import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Archive, ArchiveRestore, ArrowLeft, Eye, GitMerge, PenLine, Pin, PinOff, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Display';
import { Input, Textarea } from '@/components/ui/Form';
import { Markdown } from '@/components/ui/Markdown';
import { TagInput } from '@/components/ui/TagInput';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { useNote } from '@/hooks/useData';
import { useSyncState } from '@/hooks/useUtils';
import { createNote } from '@/repositories/notes';
import { deleteRecord } from '@/repositories/records';
import { LIMITS } from '@/schemas/common';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/dates';
import { useNoteEditor } from './useNoteEditor';

export function NoteEditor({ noteId, categories }: { noteId: string; categories: string[] }) {
  const { db, uid } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: note, loading } = useNote(noteId);
  const { draft, saveState, conflict, update, resolve } = useNoteEditor(db, uid, note);
  const [preview, setPreview] = useState(false);
  const { online } = useSyncState();

  if (loading || (note && !draft)) {
    return (
      <Card className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </Card>
    );
  }

  if (!note) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">This note no longer exists.</p>
        <p className="mt-1 text-sm text-slate-500">It may have been deleted on another device.</p>
        <div className="mt-5 flex justify-center gap-2">
          {draft && (draft.title || draft.content) && (
            <Button
              variant="secondary"
              onClick={() => {
                const r = createNote(db, uid, draft);
                navigate(`/notes/${r.id}`, { replace: true });
              }}
            >
              Restore my copy
            </Button>
          )}
          <Button onClick={() => navigate('/notes')}>Back to notes</Button>
        </div>
      </Card>
    );
  }

  if (!draft) return null;

  const remove = async () => {
    const ok = await confirm({ title: 'Delete note?', message: `"${draft.title || 'Untitled'}" will be permanently deleted.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    deleteRecord(db, uid, 'notes', note.id);
    toast.info('Note deleted');
    navigate('/notes', { replace: true });
  };

  const status =
    saveState === 'conflict'
      ? 'Conflict'
      : saveState === 'unsaved'
        ? online
          ? 'Editing…'
          : 'Offline · not saved yet (saves when you reconnect; keep this tab open)'
        : note.pending
          ? 'Saving to Firestore…'
          : `Saved · ${formatRelative(note.updatedAt)}`;

  return (
    <Card className="flex min-h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <IconButton label="Back to notes" className="lg:hidden" onClick={() => navigate('/notes')}>
          <ArrowLeft className="h-4.5 w-4.5" />
        </IconButton>
        <span
          className={cn('ml-1 truncate text-xs', note.pending || (saveState === 'unsaved' && !online) ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500')}
          role="status"
          aria-live="polite"
        >
          {status}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label={preview ? 'Edit' : 'Preview'} onClick={() => setPreview((p) => !p)}>
            {preview ? <PenLine className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </IconButton>
          <IconButton label={draft.pinned ? 'Unpin' : 'Pin'} onClick={() => update({ pinned: !draft.pinned }, true)} aria-pressed={draft.pinned}>
            {draft.pinned ? <PinOff className="h-4.5 w-4.5" /> : <Pin className="h-4.5 w-4.5" />}
          </IconButton>
          <IconButton label={draft.archived ? 'Unarchive' : 'Archive'} onClick={() => update({ archived: !draft.archived }, true)} aria-pressed={draft.archived}>
            {draft.archived ? <ArchiveRestore className="h-4.5 w-4.5" /> : <Archive className="h-4.5 w-4.5" />}
          </IconButton>
          <IconButton label="Delete note" onClick={() => void remove()} className="hover:text-rose-600">
            <Trash2 className="h-4.5 w-4.5" />
          </IconButton>
        </div>
      </div>

      {conflict && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
            <GitMerge className="h-4 w-4" aria-hidden /> This note was changed on another device.
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300/90">Choose which version to keep. Nothing is discarded until you choose.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => resolve('mine')}>
              Keep mine
            </Button>
            <Button size="sm" variant="secondary" onClick={() => resolve('theirs')}>
              Use other version
            </Button>
            <Button size="sm" variant="secondary" onClick={() => resolve('both')}>
              Keep both
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-6">
        <input
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
          aria-label="Note title"
          maxLength={LIMITS.title}
          disabled={Boolean(conflict)}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
        />
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <Input
            value={draft.category}
            onChange={(e) => update({ category: e.target.value })}
            placeholder="Category"
            aria-label="Category"
            list="note-categories"
            maxLength={LIMITS.category}
            className="h-10 py-2"
            disabled={Boolean(conflict)}
          />
          <datalist id="note-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <TagInput value={draft.tags} onChange={(tags) => update({ tags })} />
        </div>

        {preview ? (
          <div className="min-h-64 flex-1 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
            {draft.content ? <Markdown source={draft.content} /> : <p className="text-sm text-slate-400">Nothing to preview.</p>}
          </div>
        ) : (
          <Textarea
            value={draft.content}
            onChange={(e) => update({ content: e.target.value })}
            placeholder={'Start writing… Markdown is supported: # Heading, **bold**, - list, [link](https://…), - [ ] task'}
            aria-label="Note content (Markdown)"
            maxLength={LIMITS.noteContent}
            disabled={Boolean(conflict)}
            className="min-h-80 flex-1 resize-none border-transparent bg-transparent px-0 font-mono text-[0.9rem] leading-7 shadow-none focus:border-transparent focus:ring-0 dark:border-transparent dark:bg-transparent"
          />
        )}
        <p className="text-right text-xs text-slate-400">
          {draft.content.length.toLocaleString()} / {LIMITS.noteContent.toLocaleString()} characters
        </p>
      </div>
    </Card>
  );
}
