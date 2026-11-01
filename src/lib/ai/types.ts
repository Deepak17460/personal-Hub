export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: string; content: string | null };
  finish_reason: string | null;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatCompletionChoice[];
}

export type AssistantMode = 'agent' | 'chat';

export interface HubAction {
  name: string;
  args: Record<string, unknown>;
}

export interface ActionResult {
  name: string;
  ok: boolean;
  summary: string;
  link?: string;
  data?: unknown;
}

export interface AssistantTurn {
  reply: string;
  actions: ActionResult[];
  rawContent: string;
}
