/**
 * Search uses a precomputed `searchTokens` array (word prefixes) on each document so that
 * global search is an indexed Firestore `array-contains` query instead of a full scan.
 */
export const MIN_TOKEN = 2;
export const MAX_PREFIX = 15;
export const MAX_TOKENS = 400;

export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function splitWords(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_TOKEN);
}

/** Builds prefix tokens. Earlier texts get priority when the cap is reached, so pass titles first. */
export function buildSearchTokens(...texts: Array<string | null | undefined | string[]>): string[] {
  const tokens = new Set<string>();
  for (const part of texts) {
    if (!part) continue;
    const joined = Array.isArray(part) ? part.join(' ') : part;
    for (const word of splitWords(joined)) {
      const limit = Math.min(word.length, MAX_PREFIX);
      for (let len = MIN_TOKEN; len <= limit; len++) {
        tokens.add(word.slice(0, len));
        if (tokens.size >= MAX_TOKENS) return [...tokens];
      }
    }
  }
  return [...tokens];
}

/** Query words, truncated to the indexed prefix length. */
export function queryTerms(query: string): string[] {
  return [...new Set(splitWords(query).map((w) => w.slice(0, MAX_PREFIX)))];
}

/** The most selective term (longest) is used for the server-side array-contains query. */
export function primaryTerm(terms: string[]): string | null {
  if (terms.length === 0) return null;
  return [...terms].sort((a, b) => b.length - a.length)[0] ?? null;
}

export function matchesAllTerms(tokens: readonly string[] | undefined, terms: string[]): boolean {
  if (!tokens) return false;
  const set = new Set(tokens);
  return terms.every((t) => set.has(t));
}

/** Simple client-side matcher for already-loaded records. */
export function textMatches(haystack: Array<string | null | undefined | string[]>, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const words = splitWords(haystack.map((h) => (Array.isArray(h) ? h.join(' ') : (h ?? ''))).join(' '));
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}
