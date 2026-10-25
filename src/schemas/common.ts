import { z } from 'zod';
import { isValidDateStr } from '@/utils/dates';
import { isSafeHttpUrl, normalizeUrl } from '@/utils/url';
import './zodConfig';

export const LIMITS = {
  title: 200,
  noteContent: 100_000,
  description: 5_000,
  category: 60,
  tag: 40,
  tags: 20,
  subtasks: 50,
  url: 2048,
} as const;

export const tagSchema = z.string().trim().min(1).max(LIMITS.tag);
export const tagsSchema = z.array(tagSchema).max(LIMITS.tags, `At most ${LIMITS.tags} tags`);
export const categorySchema = z.string().trim().max(LIMITS.category);

export const dateStrSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine(isValidDateStr, 'Invalid date');

export const timeStrSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');

export const recurrenceSchema = z.object({
  freq: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365),
});

/** Accepts "example.com" and validates as an absolute http(s) URL after normalisation. */
export const httpUrlInputSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(LIMITS.url)
  .refine((v) => isSafeHttpUrl(normalizeUrl(v)), 'Enter a valid http:// or https:// URL');

export const optionalHttpUrlInputSchema = z
  .string()
  .trim()
  .max(LIMITS.url)
  .refine((v) => v === '' || isSafeHttpUrl(normalizeUrl(v)), 'Enter a valid http:// or https:// URL');

/** Stored URLs must already be normalised. */
export const storedHttpUrlSchema = z.string().max(LIMITS.url).refine(isSafeHttpUrl, 'Unsafe or invalid URL');

export const recordIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

export const isoDateSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid timestamp');

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, LIMITS.tag);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out.slice(0, LIMITS.tags);
}
