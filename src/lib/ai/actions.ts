import type { HubAction } from './types';

const HUB_ACTIONS_RE = /<hub_actions>\s*([\s\S]*?)\s*<\/hub_actions>/i;
const FENCED_JSON_RE = /```(?:json)?\s*([\s\S]*?)```/i;

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeAction(raw: unknown): HubAction | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const name = typeof obj.name === 'string' ? obj.name.trim() : typeof obj.tool === 'string' ? obj.tool.trim() : '';
  if (!name) return null;
  const args = asObject(obj.args) ?? asObject(obj.parameters) ?? asObject(obj.arguments) ?? {};
  return { name, args };
}

function parseActionPayload(text: string): HubAction[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeAction).filter((a): a is HubAction => a !== null);
  }

  const obj = asObject(parsed);
  if (!obj) return [];

  if (Array.isArray(obj.actions)) {
    return obj.actions.map(normalizeAction).filter((a): a is HubAction => a !== null);
  }

  // Single action object: { "name": "...", "args": {...} }
  const single = normalizeAction(obj);
  return single ? [single] : [];
}

/** Pulls hub actions from model text (tag block, fenced JSON, or whole-message JSON). */
export function extractHubActions(content: string): { actions: HubAction[]; displayText: string } {
  const tagMatch = HUB_ACTIONS_RE.exec(content);
  if (tagMatch?.[1]) {
    const actions = parseActionPayload(tagMatch[1]);
    const displayText = content.replace(HUB_ACTIONS_RE, '').trim();
    return { actions, displayText };
  }

  const fenceMatch = FENCED_JSON_RE.exec(content);
  if (fenceMatch?.[1]) {
    const actions = parseActionPayload(fenceMatch[1]);
    if (actions.length) {
      const displayText = content.replace(FENCED_JSON_RE, '').trim();
      return { actions, displayText };
    }
  }

  const whole = parseActionPayload(content);
  if (whole.length) {
    return { actions: whole, displayText: '' };
  }

  return { actions: [], displayText: content.trim() };
}

export function stripActionMarkup(content: string): string {
  return content.replace(HUB_ACTIONS_RE, '').replace(FENCED_JSON_RE, (full, body: string) => {
    const actions = parseActionPayload(body);
    return actions.length ? '' : full;
  }).trim();
}
