export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ChatProvider = 'gemini' | 'openai' | 'openai-compat';

export interface McpTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolTraceEntry {
  toolName: string;
  serverId?: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs?: number;
  error?: string;
}

export interface ChatTurnResult {
  reply: string;
  provider: ChatProvider;
  model: string;
  toolTrace: ToolTraceEntry[];
}

export type ToolCaller = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export function toolFunctionName(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`;
}