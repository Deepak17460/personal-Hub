import type { ActionResult, AssistantMode } from '@/lib/ai/types';

export interface UiActionChip {
  name: string;
  ok: boolean;
  summary: string;
  link?: string;
}

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: UiActionChip[];
  pending?: boolean;
  error?: boolean;
}

export function toUiActions(results: ActionResult[]): UiActionChip[] {
  return results.map((r) => ({
    name: r.name,
    ok: r.ok,
    summary: r.summary,
    link: r.link,
  }));
}

export type { AssistantMode };
