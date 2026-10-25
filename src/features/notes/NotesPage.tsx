import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Archive, FileText, Pin, Plus, Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ListSkeleton, PageHeader, Segmented } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { useSession } from '@/features/auth/session';
import { usePagedCollection, useSearch } from '@/hooks/useData';
import { createNote, EMPTY_NOTE } from '@/repositories/notes';
import type { Note } from '@/types/models';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/dates';
import { markdownPreview } from '@/utils/format';
import { textMatches } from '@/utils/searchTokens';
import { markFresh } from './freshNotes';
import { NoteEditor } from './NoteEditor';

type View = 'all' | 'pinned' | 'archived';

export function filterNotes(notes: Note[], view: View, opts: { category?: string; tag?: string; text?: string } = {}): Note[] {
  let rows = notes.filter((n) => (view === 'archived' ? n.archived : !n.archived));
  if (view === 'pinned') rows = rows.filter((n) => n.pinned);
  if (opts.category) rows = rows.filter((n) => n.category === opts.category);
  if (opts.tag) rows = rows.filter((n) => n.tags.includes(opts.tag!));
  if (opts.text?.trim()) rows = rows.filter((n) => textMatches([n.title, n.content, n.tags, n.category], opts.text!));
  return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.getTime() - a.updatedAt.getTime());
}

export default function NotesPage() {
  const { db, uid } = useSession();
  const { noteId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const paged = usePagedCollection('notes');
  const [view, setView] = useState<View>('all');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [text, setText] = useState('');
  const creating = useRef(false);

  // When not every note is loaded, also query the search index so matches are not missed.
  const server = useSearch(paged.hasMore ? text : '', ['notes'], 25);

  const notes = useMemo(() => {
    const map = new Map<string, Note>();
    for (const n of paged.data ?? []) map.set(n.id, n);
    for (const n of server.data?.notes ?? []) if (!map.has(n.id)) map.set(n.id, n);
    return [...map.values()];
  }, [paged.data, server.data]);

  const categories = useMemo(() => [...new Set(notes.map((n) => n.category).filter(Boolean))].sort(), [notes]);
  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);
  const visible = useMemo(() => filterNotes(notes, view, { category, tag, text }), [notes, view, category, tag, text]);

  const newNote = () => {
    const r = createNote(db, uid, { ...EMPTY_NOTE, category: category || '', tags: tag ? [tag] : [] });
    markFresh(r.id);
    navigate(`/notes/${r.id}`);
  };

  useEffect(() => {
    if (params.get('new') === '1' && !creating.current) {
      creating.current = true;
      setParams({}, { replace: true });
      newNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  return (
    <div>
      <div className={cn(noteId && 'hidden lg:block')}>
        <PageHeader
          title="Notes"
          description="Markdown notes with autosave. Works offline and syncs across devices."
          actions={
            <Button icon={<Plus className="h-4 w-4" />} onClick={newNote}>
              New note
            </Button>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section aria-label="Notes list" className={cn('min-w-0', noteId && 'hidden lg:block')}>
          <div className="mb-3 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="h-10 pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Notes view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'pinned', label: 'Pinned' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="h-9 py-1.5 text-xs">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className="h-9 py-1.5 text-xs">
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Card className="overflow-hidden">
            {paged.loading ? (
              <div className="p-4">
                <ListSkeleton rows={6} />
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                icon={view === 'archived' ? <Archive className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                title={notes.length === 0 ? 'No notes yet' : 'No notes match'}
                description={notes.length === 0 ? 'Capture ideas, checklists and references.' : 'Try another filter or search.'}
              />
            ) : (
              <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {visible.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={`/notes/${n.id}`}
                      aria-current={n.id === noteId ? 'page' : undefined}
                      className={cn(
                        'block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        n.id === noteId && 'bg-indigo-50/70 dark:bg-indigo-500/10',
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Pinned" />}
                        <span className="truncate">{n.title || 'Untitled'}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{markdownPreview(n.content, 140) || 'Empty note'}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span>{formatRelative(n.updatedAt)}</span>
                        {n.category && <Badge className="text-[11px]">{n.category}</Badge>}
                        {n.tags.slice(0, 2).map((t) => (
                          <Badge key={t} className="text-[11px]">
                            #{t}
                          </Badge>
                        ))}
                        {n.pending && <Badge tone="amber" className="text-[11px]">Pending sync</Badge>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {paged.hasMore && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" size="sm" onClick={paged.loadMore}>
                Load more
              </Button>
            </div>
          )}
        </section>

        <section aria-label="Editor" className={cn('min-w-0', !noteId && 'hidden lg:block')}>
          {noteId ? (
            <NoteEditor key={noteId} noteId={noteId} categories={categories} />
          ) : (
            <Card>
              <EmptyState
                icon={<Star className="h-5 w-5" />}
                title="Select a note"
                description="Pick a note from the list or create a new one."
                action={
                  <Button icon={<Plus className="h-4 w-4" />} onClick={newNote}>
                    New note
                  </Button>
                }
                className="py-24"
              />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
