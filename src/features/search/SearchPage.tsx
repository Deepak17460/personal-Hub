import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bookmark, CalendarDays, CheckSquare, FileText, FolderOpen, Search as SearchIcon, WifiOff } from 'lucide-react';
import { Card, EmptyState, ListSkeleton, PageHeader } from '@/components/ui/Display';
import { Input } from '@/components/ui/Form';
import { useSearch } from '@/hooks/useData';
import { useSyncState } from '@/hooks/useUtils';
import { friendlyDataError } from '@/lib/firebase/errors';
import { COLLECTIONS, type CollectionName } from '@/types/models';
import { formatDateStr } from '@/utils/dates';
import { markdownPreview } from '@/utils/format';
import { queryTerms } from '@/utils/searchTokens';
import { hostnameOf } from '@/utils/url';

const GROUPS: Record<CollectionName, { label: string; icon: typeof FileText }> = {
  notes: { label: 'Notes', icon: FileText },
  tasks: { label: 'Tasks', icon: CheckSquare },
  bookmarks: { label: 'Bookmarks', icon: Bookmark },
  documents: { label: 'Documents', icon: FolderOpen },
  events: { label: 'Events', icon: CalendarDays },
};

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const { online } = useSyncState();
  const search = useSearch(q, COLLECTIONS, 8);
  const hasTerms = queryTerms(q).length > 0;

  useEffect(() => inputRef.current?.focus(), []);

  const results = search.data;
  const total = results ? COLLECTIONS.reduce((n, c) => n + results[c].length, 0) : 0;

  return (
    <div>
      <PageHeader title="Search" description="Find notes, tasks, bookmarks, documents and events by words or word beginnings." />
      <div className="relative mb-6 max-w-2xl">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          placeholder="Type at least 2 letters…"
          aria-label="Search everything"
          className="h-12 pl-11 text-base"
        />
      </div>
      {!online && (
        <p className="mb-4 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> Offline: search needs a connection because your data is stored only in Firestore.
        </p>
      )}

      {!hasTerms ? (
        <Card>
          <EmptyState icon={<SearchIcon className="h-5 w-5" />} title="Search your workspace" description="Tip: press Ctrl+K anywhere to jump to search." />
        </Card>
      ) : search.isPending ? (
        <Card className="p-4">
          <ListSkeleton rows={5} />
        </Card>
      ) : search.isError ? (
        <Card>
          <EmptyState icon={<SearchIcon className="h-5 w-5" />} title="Search failed" description={friendlyDataError(search.error)} />
        </Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState icon={<SearchIcon className="h-5 w-5" />} title={`No results for "${q}"`} description="Search matches whole words or the start of words." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {COLLECTIONS.filter((c) => results![c].length > 0).map((c) => {
            const { label, icon: Icon } = GROUPS[c];
            return (
              <Card key={c}>
                <h2 className="flex items-center gap-2 px-5 pt-4 pb-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-slate-400" aria-hidden /> {label}
                  <span className="text-xs font-normal text-slate-400">({results![c].length})</span>
                </h2>
                <ul className="px-2 pb-3">
                  {c === 'notes' &&
                    results!.notes.map((n) => (
                      <ResultLink key={n.id} to={`/notes/${n.id}`} title={n.title || 'Untitled'} subtitle={markdownPreview(n.content, 100)} />
                    ))}
                  {c === 'tasks' &&
                    results!.tasks.map((t) => (
                      <ResultLink key={t.id} to={`/tasks?open=${t.id}`} title={t.title} subtitle={`${t.status === 'done' ? 'Completed' : 'Open'}${t.dueDate ? ` · due ${formatDateStr(t.dueDate)}` : ''}`} />
                    ))}
                  {c === 'bookmarks' &&
                    results!.bookmarks.map((b) => <ResultLink key={b.id} to={`/bookmarks?open=${b.id}`} title={b.title} subtitle={hostnameOf(b.url)} />)}
                  {c === 'documents' &&
                    results!.documents.map((d) => <ResultLink key={d.id} to={`/documents?open=${d.id}`} title={d.title} subtitle={[d.fileType, d.storageProvider].filter(Boolean).join(' · ')} />)}
                  {c === 'events' &&
                    results!.events.map((e) => <ResultLink key={e.id} to={`/calendar?open=${e.id}`} title={e.title} subtitle={`${formatDateStr(e.date)}${e.time ? ` ${e.time}` : ''}`} />)}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultLink({ to, title, subtitle }: { to: string; title: string; subtitle?: string }) {
  return (
    <li>
      <Link to={to} className="block rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-slate-500">{subtitle}</span>}
      </Link>
    </li>
  );
}
