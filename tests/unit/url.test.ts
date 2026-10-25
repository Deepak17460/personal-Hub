import { describe, expect, it } from 'vitest';
import { canonicalUrl, hostnameOf, isSafeHttpUrl, normalizeUrl, safeHref } from '@/utils/url';

describe('URL safety', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?q=1#x',
    'https://sub.domain.co.in:8443/a/b',
  ])('accepts %s', (url) => expect(isSafeHttpUrl(url)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'file:///etc/passwd',
    'ftp://example.com',
    'https://user:pass@example.com',
    'https://exa mple.com',
    '//example.com',
    'example.com',
    '',
    `https://example.com/${'a'.repeat(2100)}`,
  ])('rejects %s', (url) => expect(isSafeHttpUrl(url)).toBe(false));

  it('normalises scheme-less input to https but leaves other schemes for rejection', () => {
    expect(normalizeUrl('example.com/page')).toBe('https://example.com/page');
    expect(normalizeUrl('  //cdn.example.com ')).toBe('https://cdn.example.com');
    expect(normalizeUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(isSafeHttpUrl(normalizeUrl('javascript:alert(1)'))).toBe(false);
  });

  it('safeHref never returns an unsafe link', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref('https://ok.example')).toBe('https://ok.example');
  });

  it('canonicalises URLs for duplicate detection', () => {
    expect(canonicalUrl('https://www.Example.com/path/#frag')).toBe(canonicalUrl('http://example.com/path'));
    expect(canonicalUrl('example.com/a?b=1')).toBe('example.com/a?b=1');
  });

  it('extracts hostnames', () => {
    expect(hostnameOf('https://www.github.com/x')).toBe('github.com');
    expect(hostnameOf('not a url')).toBe('');
  });
});
