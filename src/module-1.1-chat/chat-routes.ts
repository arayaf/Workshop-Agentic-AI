import { Env } from '../env';
import { errorJson, json } from '../lib/http';
import { ChatMessage, ChatProvider, ChatTurnResult, McpTool, ToolCaller } from './types';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';

export function resolveProvider(requested?: string, env?: Env): ChatProvider {
  if (requested === 'gemini' || requested === 'openai' || requested === 'openai-compat') {
    return requested;
  }
  const defaultProvider = env?.DEFAULT_CHAT_PROVIDER;
  if (
    defaultProvider === 'gemini' ||
    defaultProvider === 'openai' ||
    defaultProvider === 'openai-compat'
  ) {
    return defaultProvider;
  }
  return 'gemini';
}

export function defaultModelFor(provider: ChatProvider, env: Env): string {
  if (provider === 'gemini') {
    return env.GEMINI_MODEL || 'gemini-flash-latest';
  }
  if (provider === 'openai') {
    return env.OPENAI_MODEL || 'gpt-4o-mini';
  }
  return env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini';
}

export async function resolveApiKey(env: Env, provider: ChatProvider): Promise<string | undefined> {
  // Module 1.2 จะเปลี่ยนไปอ่านจาก KV ก่อน แล้ว fallback ไป env
  if (provider === 'gemini') return env.GEMINI_API_KEY;
  if (provider === 'openai') return env.OPENAI_API_KEY;
  return env.OPENAI_COMPAT_API_KEY;
}

export async function resolveBaseUrl(env: Env, provider: ChatProvider): Promise<string | undefined> {
  if (provider === 'openai') return 'https://api.openai.com/v1';
  // Module 1.2 จะเปลี่ยนไปอ่านจาก KV ก่อน แล้ว fallback ไป env
  return env.OPENAI_COMPAT_BASE_URL;
}

export async function resolveTools(env: Env): Promise<{ tools: McpTool[]; callTool: ToolCaller }> {
  // Module 1.3 จะเปลี่ยนไปดึง tools จาก MCP registry
  return {
    tools: [],
    callTool: async () => {
      throw new Error('Module 1.1 ยังไม่รองรับ MCP tools');
    },
  };
}

export function buildSystemPrompt(hasTools = false): string {
  return 'คุณคือผู้ช่วย AI อัจฉริยะ ให้ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นภาษาไทยเป็นหลัก';
}

export async function runProvider(
  provider: ChatProvider,
  params: {
    history: ChatMessage[];
    tools: McpTool[];
    apiKey: string;
    baseUrl?: string;
    model: string;
    systemPrompt: string;
    callTool: ToolCaller;
  }
): Promise<{ reply: string; toolTrace: any[] }> {
  if (provider === 'gemini') {
    return runGeminiConversation({
      apiKey: params.apiKey,
      model: params.model,
      systemPrompt: params.systemPrompt,
      history: params.history,
      tools: params.tools,
      callTool: params.callTool,
    });
  }

  return runOpenAiCompatConversation({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl || '',
    model: params.model,
    systemPrompt: params.systemPrompt,
    history: params.history,
    tools: params.tools,
    callTool: params.callTool,
  });
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('Method not allowed', 405);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const message = body.message;
  if (typeof message !== 'string' || !message.trim()) {
    return errorJson('Missing or empty message', 400);
  }

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatMessage[] = rawHistory
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content }));

  // Add the incoming message to history
  history.push({ role: 'user', content: message.trim() });

  const provider = resolveProvider(body.provider, env);
  const model = (typeof body.model === 'string' && body.model.trim()) ? body.model.trim() : defaultModelFor(provider, env);

  const [apiKey, baseUrl, { tools, callTool }] = await Promise.all([
    resolveApiKey(env, provider),
    resolveBaseUrl(env, provider),
    resolveTools(env),
  ]);

  const systemPrompt = buildSystemPrompt(tools.length > 0);
  const { reply, toolTrace } = await runProvider(provider, {
    history,
    tools,
    apiKey: apiKey || '',
    baseUrl,
    model,
    systemPrompt,
    callTool,
  });

  const result: ChatTurnResult = {
    reply,
    provider,
    model,
    toolTrace,
  };

  return json(result);
}

export async function runChatTurn(params: {
  env: Env;
  provider?: ChatProvider;
  model?: string;
  history: ChatMessage[];
}): Promise<{ reply: string; toolTraceCount: number }> {
  const { env, history } = params;
  const provider = resolveProvider(params.provider, env);
  const model = params.model?.trim() || defaultModelFor(provider, env);

  const [apiKey, baseUrl, { tools, callTool }] = await Promise.all([
    resolveApiKey(env, provider),
    resolveBaseUrl(env, provider),
    resolveTools(env),
  ]);
  const systemPrompt = buildSystemPrompt(tools.length > 0);

  const result = await runProvider(provider, {
    history,
    tools,
    apiKey: apiKey || '',
    baseUrl,
    model,
    systemPrompt,
    callTool,
  });

  return { reply: result.reply, toolTraceCount: result.toolTrace.length };
}