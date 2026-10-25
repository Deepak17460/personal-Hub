import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ExternalLink, FileText, FolderOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ListSkeleton, PageHeader, TagList } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { usePagedCollection, useSearch } from '@/hooks/useData';
import { deleteRecord } from '@/repositories/records';
import type { DocumentRecord } from '@/types/models';
import { formatRelative } from '@/utils/dates';
import { formatBytes, pluralize } from '@/utils/format';
import { textMatches } from '@/utils/searchTokens';
import { safeHref } from '@/utils/url';
import { DocumentFormDialog, STORAGE_PROVIDERS } from './DocumentForm';

type Sort = 'updated' | 'created' | 'title' | 'size';

export default function DocumentsPage() {
  const { db, uid } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const paged = usePagedCollection('documents');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [provider, setProvider] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const server = useSearch(paged.hasMore ? text : '', ['documents'], 25);

  const all = useMemo(() => {
    const map = new Map<string, DocumentRecord>();
    for (const d of paged.data ?? []) map.set(d.id, d);
    for (const d of server.data?.documents ?? []) if (!map.has(d.id)) map.set(d.id, d);
    return [...map.values()];
  }, [paged.data, server.data]);

  const categories = useMemo(() => [...new Set(all.map((d) => d.category).filter(Boolean))].sort(), [all]);
  const visible = useMemo(() => {
    const rows = all
      .filter((d) => (!category || d.category === category) && (!provider || d.storageProvider === provider))
      .filter((d) => !text.trim() || textMatches([d.title, d.description, d.tags, d.category, d.fileType, d.storageProvider], text));
    const by: Record<Sort, (a: DocumentRecord, b: DocumentRecord) => number> = {
      updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      title: (a, b) => a.title.localeCompare(b.title),
      size: (a, b) => (b.fileSizeBytes ?? -1) - (a.fileSizeBytes ?? -1),
    };
    return rows.sort(by[sort]);
  }, [all, category, provider, text, sort]);

  const totalSize = visible.reduce((sum, d) => sum + (d.fileSizeBytes ?? 0), 0);
  const openId = params.get('open');
  const editing = openId ? (all.find((d) => d.id === openId) ?? null) : null;

  const remove = async (d: DocumentRecord) => {
    if (!(await confirm({ title: 'Delete document record?', message: `"${d.title}" metadata will be deleted. The file itself is not affected.`, confirmLabel: 'Delete', danger: true }))) return;
    deleteRecord(db, uid, 'documents', d.id);
    toast.info('Document record deleted');
  };

  return (
    <div>
      <PageHeader
        title="Documents"
        description="An index of important documents and where each file is stored."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
            Add document
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <div className="relative col-span-2 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search documents" aria-label="Search documents" className="h-10 pl-9" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter" className="h-10 py-2 sm:w-40">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Storage filter" className="h-10 py-2 sm:w-40">
          <option value="">All locations</option>
          {STORAGE_PROVIDERS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort documents" className="col-span-2 h-10 py-2 sm:w-40">
          <option value="updated">Recently updated</option>
          <option value="created">Recently added</option>
          <option value="title">Title</option>
          <option value="size">Size</option>
        </Select>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        {pluralize(visible.length, 'document')} · {formatBytes(totalSize)} recorded size
      </p>

      <Card className="overflow-hidden">
        {paged.loading ? (
          <div className="p-4">
            <ListSkeleton rows={5} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-5 w-5" />}
            title={all.length === 0 ? 'No documents yet' : 'No documents match'}
            description="Record important documents and link to the file in Drive, OneDrive or Dropbox."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((d) => (
              <li key={d.id} className="group flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setParams({ open: d.id })} className="text-left text-sm font-medium break-words hover:text-indigo-600 dark:hover:text-indigo-400">
                    {d.title}
                  </button>
                  {d.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{d.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="indigo">{d.fileType || 'File'}</Badge>
                    {d.storageProvider && <Badge>{d.storageProvider}</Badge>}
                    {d.category && <Badge>{d.category}</Badge>}
                    {d.fileSizeBytes != null && <Badge>{formatBytes(d.fileSizeBytes)}</Badge>}
                    <TagList tags={d.tags} max={3} />
                    <span className="text-[11px] text-slate-400">Updated {formatRelative(d.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0">
                  {safeHref(d.externalUrl) && (
                    <a
                      href={safeHref(d.externalUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${d.title}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <IconButton label={`Edit ${d.title}`} onClick={() => setParams({ open: d.id })} className="h-9 w-9">
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Delete ${d.title}`} onClick={() => void remove(d)} className="h-9 w-9 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {paged.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={paged.loadMore}>
            Load more
          </Button>
        </div>
      )}
      <DocumentFormDialog open={params.get('new') === '1' || editing !== null} doc={editing} categories={categories} onClose={() => setParams({}, { replace: true })} />
    </div>
  );
}
