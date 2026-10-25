import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { TagInput } from '@/components/ui/TagInput';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { createRecord, updateRecord } from '@/repositories/records';
import { dedupeTags } from '@/schemas/common';
import { documentFormSchema, type DocumentFormValues } from '@/schemas/entities';
import type { DocumentFields, DocumentRecord } from '@/types/models';
import { normalizeUrl } from '@/utils/url';

export const STORAGE_PROVIDERS = ['Google Drive', 'OneDrive', 'Dropbox', 'iCloud Drive', 'Box', 'Local device', 'Physical copy', 'Other'];
export const FILE_TYPES = ['PDF', 'Image', 'Word document', 'Spreadsheet', 'Presentation', 'Text', 'Archive', 'Video', 'Audio', 'Other'];

export function toDocumentFields(v: DocumentFormValues): DocumentFields {
  return {
    title: v.title.trim(),
    description: v.description,
    category: v.category.trim(),
    tags: dedupeTags(v.tags),
    storageProvider: v.storageProvider,
    fileType: v.fileType,
    externalUrl: v.externalUrl.trim() ? normalizeUrl(v.externalUrl) : null,
    fileSizeBytes: v.fileSizeMb.trim() ? Math.round(Number(v.fileSizeMb) * 1024 * 1024) : null,
  };
}

function toForm(d: DocumentRecord | null): DocumentFormValues {
  return {
    title: d?.title ?? '',
    description: d?.description ?? '',
    category: d?.category ?? '',
    tags: d?.tags ?? [],
    storageProvider: d?.storageProvider ?? 'Google Drive',
    fileType: d?.fileType ?? 'PDF',
    externalUrl: d?.externalUrl ?? '',
    fileSizeMb: d?.fileSizeBytes != null ? String(Math.round((d.fileSizeBytes / 1024 / 1024) * 100) / 100) : '',
  };
}

export function DocumentFormDialog({ open, doc, categories, onClose }: { open: boolean; doc: DocumentRecord | null; categories: string[]; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={doc ? 'Edit document' : 'Add document'} description="Stores details and a link to where the file lives. Files are not uploaded.">
      {open && <Body key={doc?.id ?? 'new'} doc={doc} categories={categories} onDone={onClose} />}
    </Dialog>
  );
}

function Body({ doc, categories, onDone }: { doc: DocumentRecord | null; categories: string[]; onDone: () => void }) {
  const { db, uid } = useSession();
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DocumentFormValues>({ resolver: zodResolver(documentFormSchema), defaultValues: toForm(doc) });

  const onSubmit = handleSubmit((values) => {
    const fields = toDocumentFields(values);
    if (doc) updateRecord(db, uid, 'documents', doc, fields);
    else createRecord(db, uid, 'documents', fields);
    toast.success(doc ? 'Document updated' : 'Document added');
    onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Title" error={errors.title?.message}>
        {(p) => <Input {...p} {...register('title')} autoFocus maxLength={200} placeholder="e.g. Passport scan" />}
      </Field>
      <Field label="Link to file" error={errors.externalUrl?.message} hint="Paste a share link from Drive, OneDrive, Dropbox… (http/https only).">
        {(p) => <Input {...p} {...register('externalUrl')} type="url" inputMode="url" placeholder="https://drive.google.com/…" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Stored in">
          {(p) => (
            <Select {...p} {...register('storageProvider')}>
              {STORAGE_PROVIDERS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="File type">
          {(p) => (
            <Select {...p} {...register('fileType')}>
              {FILE_TYPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Size (MB)" error={errors.fileSizeMb?.message}>
          {(p) => <Input {...p} {...register('fileSizeMb')} inputMode="decimal" placeholder="Optional" />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          {(p) => (
            <>
              <Input {...p} {...register('category')} list="doc-categories" maxLength={60} placeholder="e.g. Identity, Finance" />
              <datalist id="doc-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tags">
          {(p) => <Controller control={control} name="tags" render={({ field }) => <TagInput {...p} value={field.value} onChange={field.onChange} />} />}
        </Field>
      </div>
      <Field label="Description" error={errors.description?.message}>
        {(p) => <Textarea {...p} {...register('description')} rows={3} placeholder="Notes, expiry dates, where the original is kept…" />}
      </Field>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{doc ? 'Save changes' : 'Add document'}</Button>
      </div>
    </form>
  );
}
