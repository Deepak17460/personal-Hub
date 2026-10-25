import { describe, expect, it } from 'vitest';
import { buildSearchTokens, matchesAllTerms, MAX_TOKENS, primaryTerm, queryTerms, textMatches } from '@/utils/searchTokens';
import { tokensFor } from '@/repositories/mappers';

describe('search tokens', () => {
  it('creates lowercase word prefixes without diacritics', () => {
    const tokens = buildSearchTokens('Café Résumé');
    expect(tokens).toContain('ca');
    expect(tokens).toContain('cafe');
    expect(tokens).toContain('resume');
    expect(tokens).not.toContain('c');
  });

  it('caps the number of tokens and keeps title tokens first', () => {
    const long = Array.from({ length: 1000 }, (_, i) => `word${i}xyz`).join(' ');
    const tokens = buildSearchTokens('Groceries', long);
    expect(tokens.length).toBeLessThanOrEqual(MAX_TOKENS);
    expect(tokens).toContain('groceries');
  });

  it('matches multi-word queries using every term', () => {
    const tokens = buildSearchTokens('Quarterly tax filing', ['finance']);
    const terms = queryTerms('tax fin');
    expect(primaryTerm(terms)).toBe('tax');
    expect(matchesAllTerms(tokens, terms)).toBe(true);
    expect(matchesAllTerms(tokens, queryTerms('tax holiday'))).toBe(false);
  });

  it('indexes bookmark hostnames and task subtasks', () => {
    expect(tokensFor('bookmarks', { title: 'Docs', url: 'https://developer.mozilla.org/en-US/' })).toContain('mozilla');
    expect(tokensFor('tasks', { title: 'Trip', subtasks: [{ id: 'a', title: 'Passport', done: false }] })).toContain('passport');
  });

  it('client-side textMatches supports prefixes', () => {
    expect(textMatches(['Weekly review', ['work']], 'wee rev')).toBe(true);
    expect(textMatches(['Weekly review'], 'monthly')).toBe(false);
    expect(textMatches(['anything'], '  ')).toBe(true);
  });
});
