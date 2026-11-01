import { addDays, todayStr } from '@/utils/dates';
import { extractHubActions } from './actions';
import { assistantText, createChatCompletion } from './client';
import { executeHubAction, TOOL_CATALOG, type ToolContext } from './tools';
import type { ActionResult, AssistantMode, AssistantTurn, ChatMessage } from './types';

const MAX_ROUNDS = 5;

const STYLE_RULES = [
  'Style: precise and concise. Prefer short paragraphs or plain bullet lists.',
  'Do not use emojis, emoji icons, decorative symbols, or icon-like characters (no calendar/check/warning/colored-dot emojis).',
  'Do not build large markdown tables unless the owner asks for a table; a short bullet list is enough.',
  'Lead with the answer; skip filler and cheerleading.',
].join('\n');

function chatSystemPrompt(today: string): string {
  return [
    'You are the Personal Hub assistant — a private organizer for notes, tasks, bookmarks, documents, and calendar events.',
    `Today is ${today} (local). Tomorrow is ${addDays(today, 1)}.`,
    STYLE_RULES,
    'Help the owner plan, draft, and organize.',
    'You cannot change hub data in chat-only mode; give advice and drafts they can copy.',
  ].join('\n');
}

function agentSystemPrompt(today: string): string {
  return [
    'You are the Personal Hub assistant with permission to read and write the owner’s private hub data.',
    `Today is ${today} (local). Tomorrow is ${addDays(today, 1)}.`,
    STYLE_RULES,
    'When the owner asks you to create, update, find, read, summarize, or link hub items, use actions.',
    'For “what does my note say”, “read this note”, or summaries of saved content: call read_note (search first if you lack an id), then answer from the returned body.',
    'For “save/add this URL/link/website”: call create_bookmark (or add_link).',
    'For calendar events, meetings, reminders, or alarms (“remind me”, “set an alarm”, “notify me”): call create_event or set_alarm with date, time when known, and reminderMinutes.',
    'For tasks with a due date/time or task notifications: call create_task / update_task with dueDate, dueTime (HH:MM), and reminderMinutes (0 = at due time).',
    'When they only want brainstorming or wording help, reply in prose without actions.',
    TOOL_CATALOG,
  ].join('\n\n');
}

function formatActionResults(results: ActionResult[]): string {
  return results
    .map((r, i) => `${i + 1}. ${r.ok ? 'OK' : 'FAILED'} ${r.name}: ${r.summary}${r.data ? `\n   data: ${JSON.stringify(r.data)}` : ''}`)
    .join('\n');
}

export interface RunAssistantOptions {
  mode: AssistantMode;
  history: ChatMessage[];
  userMessage: string;
  ctx: ToolContext;
  signal?: AbortSignal;
  onActions?: (results: ActionResult[]) => void;
}

export async function runAssistantTurn(opts: RunAssistantOptions): Promise<AssistantTurn> {
  const today = todayStr();
  const system = opts.mode === 'agent' ? agentSystemPrompt(today) : chatSystemPrompt(today);
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...opts.history, { role: 'user', content: opts.userMessage }];

  const allActions: ActionResult[] = [];
  let lastDisplay = '';
  let lastRaw = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await createChatCompletion(messages, { signal: opts.signal });
    const raw = assistantText(response);
    lastRaw = raw;

    if (opts.mode === 'chat') {
      return { reply: raw, actions: [], rawContent: raw };
    }

    const { actions, displayText } = extractHubActions(raw);
    lastDisplay = displayText || lastDisplay;

    if (!actions.length) {
      return { reply: displayText || raw, actions: allActions, rawContent: raw };
    }

    messages.push({ role: 'assistant', content: raw });
    const results: ActionResult[] = [];
    for (const action of actions) {
      const result = await executeHubAction(opts.ctx, action);
      results.push(result);
      allActions.push(result);
    }
    opts.onActions?.(results);

    messages.push({
      role: 'user',
      content: [
        'Action results (already applied in Personal Hub):',
        formatActionResults(results),
        'Reply briefly and plainly (no emojis, no icon characters, no big tables). Confirm what you did. Use another <hub_actions> block only if more steps are still needed.',
      ].join('\n'),
    });
  }

  return {
    reply: lastDisplay || 'I hit the action limit for this turn. Check the results above and ask me to continue if needed.',
    actions: allActions,
    rawContent: lastRaw,
  };
}
