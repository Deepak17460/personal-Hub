import type { Bookmark, BookmarkFields } from '@/types/models';
import { dedupeTags, LIMITS } from '@/schemas/common';
import { canonicalUrl, isSafeHttpUrl, normalizeUrl } from '@/utils/url';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Parses the Netscape bookmark HTML format exported by Chrome, Edge, Firefox and Safari.
 * DOMParser does not execute scripts; only <a href> values with http(s) URLs are kept.
 */
export function parseBookmarkHtml(html: string): BookmarkFields[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: BookmarkFields[] = [];
  doc.querySelectorAll('a[href]').forEach((a) => {
    const url = normalizeUrl(a.getAttribute('href') ?? '');
    if (!isSafeHttpUrl(url)) return;
    const folders: string[] = [];
    let node: Element | null = a.closest('dl');
    while (node) {
      const header = node.previousElementSibling;
      if (header && header.tagName === 'H3' && header.textContent) folders.unshift(header.textContent.trim());
      node = node.parentElement?.closest('dl') ?? null;
    }
    const tagsAttr = a.getAttribute('tags');
    out.push({
      url,
      title: (a.textContent?.trim() || url).slice(0, LIMITS.title),
      description: '',
      category: (folders[folders.length - 1] ?? '').slice(0, LIMITS.category),
      tags: dedupeTags(tagsAttr ? tagsAttr.split(',') : []),
      favorite: false,
    });
  });
  return out;
}

export function toBookmarkHtml(bookmarks: Bookmark[]): string {
  const byCategory = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    const key = b.category || 'Unsorted';
    byCategory.set(key, [...(byCategory.get(key) ?? []), b]);
  }
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Personal Hub Bookmarks</H1>',
    '<DL><p>',
  ];
  for (const [category, items] of byCategory) {
    lines.push(`  <DT><H3>${escapeHtml(category)}</H3>`, '  <DL><p>');
    for (const b of items) {
      if (!isSafeHttpUrl(b.url)) continue;
      const added = Math.floor(b.createdAt.getTime() / 1000);
      const tags = b.tags.length ? ` TAGS="${escapeHtml(b.tags.join(','))}"` : '';
      lines.push(`    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${added}"${tags}>${escapeHtml(b.title)}</A>`);
    }
    lines.push('  </DL><p>');
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}

/** Drops entries whose URL already exists (or repeats within the file). */
export function dedupeBookmarks(incoming: BookmarkFields[], existing: Pick<Bookmark, 'url'>[]): { fresh: BookmarkFields[]; duplicates: number } {
  const seen = new Set(existing.map((b) => canonicalUrl(b.url)));
  const fresh: BookmarkFields[] = [];
  let duplicates = 0;
  for (const b of incoming) {
    const key = canonicalUrl(b.url);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    fresh.push(b);
  }
  return { fresh, duplicates };
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
