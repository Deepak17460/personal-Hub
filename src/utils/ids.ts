const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random 20-char ID (same shape as Firestore auto IDs). Generated client-side so retries are idempotent. */
export function randomId(length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
