import { useCallback, useRef, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { runAssistantTurn } from '@/lib/ai/agent';
import { AiClientError } from '@/lib/ai/client';
import { isAiConfigured } from '@/lib/ai/config';
import type { ChatMessage } from '@/lib/ai/types';
import { randomId } from '@/utils/ids';
import { toUiActions, type AssistantMode, type UiMessage } from './types';

const SUGGESTIONS_AGENT = [
  'What’s on my plate today?',
  'Show my recent notes and summarize the top one',
  'Set an alarm tomorrow at 9:00 to stretch',
  'Create a task: review weekly goals tomorrow',
];

const SUGGESTIONS_CHAT = [
  'Help me prioritize my week',
  'Draft a short standup update',
  'Suggest a structure for project notes',
  'Rewrite this more clearly: …',
];

export function useAssistantChat() {
  const { db, uid } = useSession();
  const [mode, setMode] = useState<AssistantMode>('agent');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const configured = isAiConfigured;
  const suggestions = mode === 'agent' ? SUGGESTIONS_AGENT : SUGGESTIONS_CHAT;

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setBusy(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      if (!configured) {
        setMessages((prev) => [
          ...prev,
          {
            id: randomId(),
            role: 'system',
            content: 'AI is not configured. Add VITE_AI_BASE_URL and VITE_AI_API_KEY to .env.local, then restart the dev server.',
            error: true,
          },
        ]);
        return;
      }

      const history: ChatMessage[] = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => !m.error && !m.pending)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const userMsg: UiMessage = { id: randomId(), role: 'user', content };
      const pendingId = randomId();
      setMessages((prev) => [...prev, userMsg, { id: pendingId, role: 'assistant', content: 'Thinking…', pending: true }]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const turn = await runAssistantTurn({
          mode,
          history,
          userMessage: content,
          ctx: { db, uid },
          signal: controller.signal,
          onActions: (results) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? { ...m, content: 'Working…', actions: [...(m.actions ?? []), ...toUiActions(results)] }
                  : m,
              ),
            );
          },
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant',
                  content: turn.reply || 'Done.',
                  actions: turn.actions.length ? toUiActions(turn.actions) : m.actions,
                }
              : m,
          ),
        );
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages((prev) => prev.filter((m) => m.id !== pendingId && m.id !== userMsg.id));
          return;
        }
        const message =
          error instanceof AiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something went wrong talking to the assistant.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId ? { id: pendingId, role: 'assistant', content: message, error: true } : m,
          ),
        );
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, configured, db, messages, mode, uid],
  );

  return { mode, setMode, messages, busy, configured, suggestions, send, clear, stop };
}
