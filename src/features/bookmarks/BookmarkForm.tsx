import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Switch, Textarea } from '@/components/ui/Form';
import { TagInput } from '@/components/ui/TagInput';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { createRecord, updateRecord } from '@/repositories/records';
import { dedupeTags } from '@/schemas/common';
import { bookmarkFormSchema, type BookmarkFormValues } from '@/schemas/entities';
import type { Bookmark, BookmarkFields } from '@/types/models';
import { canonicalUrl, hostnameOf, normalizeUrl } from '@/utils/url';

export function toBookmarkFields(v: BookmarkFormValues): BookmarkFields {
  const url = normalizeUrl(v.url);
  return { ...v, url, title: v.title.trim() || hostnameOf(url), category: v.category.trim(), tags: dedupeTags(v.tags) };
}

interface Props {
  open: boolean;
  bookmark: Bookmark | null;
  existing: Bookmark[];
  categories: string[];
  onClose: () => void;
}

export function BookmarkFormDialog({ open, bookmark, existing, categories, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={bookmark ? 'Edit bookmark' : 'Save a link'}>
      {open && <Body key={bookmark?.id ?? 'new'} bookmark={bookmark} existing={existing} categories={categories} onDone={onClose} />}
    </Dialog>
  );
}

function Body({ bookmark, existing, categories, onDone }: { bookmark: Bookmark | null; existing: Bookmark[]; categories: string[]; onDone: () => void }) {
  const { db, uid } = useSession();
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm<BookmarkFormValues>({
    resolver: zodResolver(bookmarkFormSchema),
    defaultValues: bookmark
      ? { url: bookmark.url, title: bookmark.title, description: bookmark.description, category: bookmark.category, tags: bookmark.tags, favorite: bookmark.favorite }
      : { url: '', title: '', description: '', category: '', tags: [], favorite: false },
  });

  const onSubmit = handleSubmit((values) => {
    const fields = toBookmarkFields(values);
    const dup = existing.find((b) => b.id !== bookmark?.id && canonicalUrl(b.url) === canonicalUrl(fields.url));
    if (dup) {
      setError('url', { message: `Already saved as "${dup.title}"` });
      return;
    }
    if (bookmark) updateRecord(db, uid, 'bookmarks', bookmark, fields);
    else createRecord(db, uid, 'bookmarks', fields);
    toast.success(bookmark ? 'Bookmark updated' : 'Bookmark saved');
    onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="URL" error={errors.url?.message} hint="Only http:// and https:// links are allowed.">
        {(p) => (
          <Input
            {...p}
            {...register('url', {
              onBlur: () => {
                if (!getValues('title')) setValue('title', hostnameOf(normalizeUrl(getValues('url'))));
              },
            })}
            type="url"
            inputMode="url"
            autoFocus
            placeholder="https://example.com"
          />
        )}
      </Field>
      <Field label="Title" error={errors.title?.message} hint="Leave empty to use the website name.">
        {(p) => <Input {...p} {...register('title')} maxLength={200} />}
      </Field>
      <Field label="Description">{(p) => <Textarea {...p} {...register('description')} rows={2} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          {(p) => (
            <>
              <Input {...p} {...register('category')} list="bookmark-categories" maxLength={60} />
              <datalist id="bookmark-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tags" error={errors.tags?.message}>
          {(p) => <Controller control={control} name="tags" render={({ field }) => <TagInput {...p} value={field.value} onChange={field.onChange} />} />}
        </Field>
      </div>
      <Controller
        control={control}
        name="favorite"
        render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Favourite" description="Favourites are pinned to your dashboard." />}
      />
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{bookmark ? 'Save changes' : 'Save link'}</Button>
      </div>
    </form>
  );
}
