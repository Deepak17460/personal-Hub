import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bookmark as BookmarkIcon, Download, ExternalLink, Pencil, Plus, Search, Star, Trash2, Upload } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, EmptyState, ListSkeleton, PageHeader, TagList } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { usePagedCollection, useSearch } from '@/hooks/useData';
import { fetchAll } from '@/repositories/backup';
import { createRecord, deleteRecord, updateRecord } from '@/repositories/records';
import type { Bookmark } from '@/types/models';
import { cn } from '@/utils/cn';
import { todayStr } from '@/utils/dates';
import { textMatches } from '@/utils/searchTokens';
import { hostnameOf, safeHref } from '@/utils/url';
import { BookmarkFormDialog } from './BookmarkForm';
import { dedupeBookmarks, downloadText, parseBookmarkHtml, toBookmarkHtml } from './bookmarkIO';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export default function BookmarksPage() {
  const { db, uid } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const paged = usePagedCollection('bookmarks');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const server = useSearch(paged.hasMore ? text : '', ['bookmarks'], 25);

  const all = useMemo(() => {
    const map = new Map<string, Bookmark>();
    for (const b of paged.data ?? []) map.set(b.id, b);
    for (const b of server.data?.bookmarks ?? []) if (!map.has(b.id)) map.set(b.id, b);
    return [...map.values()];
  }, [paged.data, server.data]);

  const categories = useMemo(() => [...new Set(all.map((b) => b.category).filter(Boolean))].sort(), [all]);
  const visible = useMemo(
    () =>
      all
        .filter((b) => (!favOnly || b.favorite) && (!category || b.category === category))
        .filter((b) => !text.trim() || textMatches([b.title, b.url, b.description, b.tags, b.category], text))
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.getTime() - a.updatedAt.getTime()),
    [all, favOnly, category, text],
  );

  const isNew = params.get('new') === '1';
  const openId = params.get('open');
  const editing = openId ? (all.find((b) => b.id === openId) ?? null) : null;

  const remove = async (b: Bookmark) => {
    if (!(await confirm({ title: 'Delete bookmark?', message: `"${b.title}" will be removed.`, confirmLabel: 'Delete', danger: true }))) return;
    deleteRecord(db, uid, 'bookmarks', b.id);
    toast.info('Bookmark deleted');
  };

  const exportHtml = async () => {
    setBusy(true);
    try {
      const rows = await fetchAll(db, uid, 'bookmarks', { fromCache: !navigator.onLine });
      downloadText(`bookmarks-${todayStr()}.html`, toBookmarkHtml(rows), 'text/html');
      toast.success(`Exported ${rows.length} bookmarks`);
    } catch {
      toast.error('Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error('File is larger than 10 MB.');
      return;
    }
    setBusy(true);
    try {
      const incoming = parseBookmarkHtml(await file.text());
      if (incoming.length === 0) {
        toast.warning('No http(s) bookmarks found in that file.');
        return;
      }
      const existing = await fetchAll(db, uid, 'bookmarks', { fromCache: !navigator.onLine });
      const { fresh, duplicates } = dedupeBookmarks(incoming, existing);
      const ok = await confirm({
        title: 'Import bookmarks?',
        message: `${fresh.length} new bookmarks will be added${duplicates ? `, ${duplicates} duplicates skipped` : ''}.`,
        confirmLabel: 'Import',
      });
      if (!ok) return;
      for (const b of fresh.slice(0, 2000)) createRecord(db, uid, 'bookmarks', b);
      toast.success(`Imported ${Math.min(fresh.length, 2000)} bookmarks`);
    } catch {
      toast.error('That file could not be read as a bookmarks export.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <PageHeader
        title="Bookmarks"
        description="Your saved links, organised with categories and tags."
        actions={
          <>
            <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} loading={busy} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={busy} onClick={() => void exportHtml()}>
              Export
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
              Add
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search bookmarks" aria-label="Search bookmarks" className="h-10 pl-9" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter" className="h-10 py-2 sm:w-44">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Button variant={favOnly ? 'primary' : 'secondary'} aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} icon={<Star className={cn('h-4 w-4', favOnly && 'fill-current')} />}>
          Favourites
        </Button>
      </div>

      {paged.loading ? (
        <Card className="p-4">
          <ListSkeleton rows={6} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookmarkIcon className="h-5 w-5" />}
            title={all.length === 0 ? 'No bookmarks yet' : 'No bookmarks match'}
            description={all.length === 0 ? 'Save links or import them from your browser (HTML export).' : 'Try another search or filter.'}
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((b) => (
            <li key={b.id}>
              <Card className="group flex h-full flex-col p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-sm font-semibold text-indigo-700 uppercase dark:from-indigo-500/15 dark:to-violet-500/15 dark:text-indigo-300">
                    {(b.title || hostnameOf(b.url)).slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={safeHref(b.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 text-sm font-semibold break-words hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      {b.title}
                    </a>
                    <p className="truncate text-xs text-slate-500">{hostnameOf(b.url)}</p>
                  </div>
                  <IconButton
                    label={b.favorite ? 'Remove from favourites' : 'Add to favourites'}
                    aria-pressed={b.favorite}
                    onClick={() => updateRecord(db, uid, 'bookmarks', b, { favorite: !b.favorite })}
                    className="-mt-1 -mr-1 h-9 w-9"
                  >
                    <Star className={cn('h-4 w-4', b.favorite && 'fill-amber-400 text-amber-400')} />
                  </IconButton>
                </div>
                {b.description && <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{b.description}</p>}
                <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                  <div className="min-w-0 space-y-1">
                    {b.category && <p className="truncate text-xs font-medium text-slate-500">{b.category}</p>}
                    <TagList tags={b.tags} max={3} />
                  </div>
                  <div className="flex shrink-0">
                    <a
                      href={safeHref(b.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${b.title}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <IconButton label={`Edit ${b.title}`} onClick={() => setParams({ open: b.id })} className="h-9 w-9">
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton label={`Delete ${b.title}`} onClick={() => void remove(b)} className="h-9 w-9 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {paged.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={paged.loadMore}>
            Load more
          </Button>
        </div>
      )}

      <BookmarkFormDialog open={isNew || editing !== null} bookmark={editing} existing={all} categories={categories} onClose={() => setParams({}, { replace: true })} />
    </div>
  );
}
