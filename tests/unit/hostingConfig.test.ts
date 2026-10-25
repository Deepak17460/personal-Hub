import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface HeaderRule {
  source?: string;
  regex?: string;
  headers: { key: string; value: string }[];
}

const firebase = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
  hosting: { headers: HeaderRule[] };
};
const cloudflareCsp = /Content-Security-Policy: (.*)/.exec(readFileSync('public/_headers', 'utf8'))?.[1]?.trim();

const [security, assets] = firebase.hosting.headers;
const header = (rule: HeaderRule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value;

describe('Firebase Hosting headers', () => {
  it('applies the security headers to app paths but not to the reserved /__/ auth handler', () => {
    const matcher = new RegExp(security?.regex ?? '$^', 'u');
    for (const path of ['/', '/index.html', '/signin', '/notes/abc', '/assets/app.js', '/a/b/c', '/_x', '/__x']) {
      expect(matcher.test(path), path).toBe(true);
    }
    for (const path of ['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json']) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it('serves the same CSP as Cloudflare Pages and allows the Google sign-in frames', () => {
    const csp = header(security, 'Content-Security-Policy');
    expect(csp).toBe(cloudflareCsp);
    expect(csp).toMatch(/frame-src 'self' https:\/\/\*\.firebaseapp\.com/);
    expect(csp).toContain('https://apis.google.com');
    expect(header(security, 'X-Frame-Options')).toBe('DENY');
    expect(header(security, 'Cache-Control')).toBe('no-cache');
  });

  it('long-caches only the content-hashed assets, after the general rule', () => {
    expect(assets?.source).toBe('/assets/**');
    expect(header(assets, 'Cache-Control')).toContain('immutable');
  });
});
