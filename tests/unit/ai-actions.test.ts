import { describe, expect, it } from 'vitest';
import { extractHubActions, stripActionMarkup } from '@/lib/ai/actions';

describe('extractHubActions', () => {
  it('parses a hub_actions tag block mixed with prose', () => {
    const content = `Sure — I'll add that.\n<hub_actions>\n[{"name":"create_task","args":{"title":"Buy milk","dueDate":"2026-11-03"}}]\n</hub_actions>`;
    const { actions, displayText } = extractHubActions(content);
    expect(actions).toEqual([{ name: 'create_task', args: { title: 'Buy milk', dueDate: '2026-11-03' } }]);
    expect(displayText).toContain("I'll add that");
    expect(displayText).not.toContain('hub_actions');
  });

  it('parses a whole-message actions object', () => {
    const { actions, displayText } = extractHubActions(
      JSON.stringify({ actions: [{ name: 'create_note', args: { title: 'Ideas', content: 'Ship AI' } }] }),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]?.name).toBe('create_note');
    expect(displayText).toBe('');
  });

  it('parses fenced JSON with tool alias keys', () => {
    const content = 'Working on it.\n```json\n{"tool":"search_hub","parameters":{"query":"launch"}}\n```';
    const { actions, displayText } = extractHubActions(content);
    expect(actions).toEqual([{ name: 'search_hub', args: { query: 'launch' } }]);
    expect(displayText).toBe('Working on it.');
  });

  it('returns plain text when no actions are present', () => {
    const { actions, displayText } = extractHubActions('Here is a draft standup update.');
    expect(actions).toEqual([]);
    expect(displayText).toBe('Here is a draft standup update.');
  });
});

describe('stripActionMarkup', () => {
  it('removes action tags from assistant text', () => {
    expect(stripActionMarkup('Done.\n<hub_actions>[{"name":"get_task_counts","args":{}}]</hub_actions>')).toBe('Done.');
  });
});
