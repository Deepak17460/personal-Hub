const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/** Adds https:// to scheme-less input such as "example.com/page". Leaves other schemes untouched for validation. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

/** Only absolute http(s) URLs with a hostname are allowed; javascript:, data:, file: etc. are rejected. */
export function isSafeHttpUrl(input: string): boolean {
  if (!input || input.length > 2048) return false;
  // Reject control characters/whitespace that browsers may strip to smuggle a scheme.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\s]/.test(input)) return false;
  try {
    const url = new URL(input);
    return SAFE_PROTOCOLS.has(url.protocol) && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Returns a canonical form suitable for duplicate detection. */
export function canonicalUrl(input: string): string {
  try {
    const url = new URL(normalizeUrl(input));
    url.hash = '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}${url.search}`;
  } catch {
    return input.trim().toLowerCase();
  }
}

export function hostnameOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Use for every href built from user data. Returns undefined for unsafe URLs so no link is rendered. */
export function safeHref(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  return isSafeHttpUrl(input) ? input : undefined;
}
