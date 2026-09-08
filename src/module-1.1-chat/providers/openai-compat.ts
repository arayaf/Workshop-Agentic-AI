import { ChatMessage, McpTool, ToolCaller, ToolTraceEntry, toolFunctionName } from '../types';

export interface OpenAiCompatConversationParams {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  history: ChatMessage[];
  tools: McpTool[];
  callTool: ToolCaller;
}

export async function runOpenAiCompatConversation(
  params: OpenAiCompatConversationParams
): Promise<{ reply: string; toolTrace: ToolTraceEntry[] }> {
  const { apiKey, baseUrl, model, systemPrompt, history, tools, callTool } = params;

  if (!baseUrl || !baseUrl.trim()) {
    return {
      reply: 'ยังไม่ได้ตั้งค่า Base URL สำหรับ OpenAI-compatible gateway (OPENAI_COMPAT_BASE_URL)',
      toolTrace: [],
    };
  }

  if (!apiKey || !apiKey.trim()) {
    return {
      reply: 'ยังไม่ได้ตั้งค่า API Key (OPENAI_API_KEY หรือ OPENAI_COMPAT_API_KEY)',
      toolTrace: [],
    };
  }

  const toolTrace: ToolTraceEntry[] = [];

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }

  const openAiTools = tools.map((t) => ({
    type: 'function',
    function: {
      name: toolFunctionName(t.serverId, t.name),
      description: t.description || '',
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const url = `${normalizedBaseUrl}/chat/completions`;

  const MAX_ROUNDS = 4;
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const bodyPayload: any = {
      model,
      messages,
    };

    if (openAiTools.length > 0) {
      bodyPayload.tools = openAiTools;
      bodyPayload.tool_choice = 'auto';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        reply: `เกิดข้อผิดพลาดในการเรียก OpenAI API (${res.status}): ${errText}`,
        toolTrace,
      };
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      return {
        reply: 'ไม่ได้รับคำตอบจากโมเดล',
        toolTrace,
      };
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls || [];
    if (toolCalls.length === 0 || round === MAX_ROUNDS) {
      return {
        reply: assistantMessage.content || '',
        toolTrace,
      };
    }

    for (const tc of toolCalls) {
      const fullName = tc.function.name as string;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments || '{}');
      } catch {
        parsedArgs = {};
      }

      const sepIdx = fullName.indexOf('__');
      const serverId = sepIdx !== -1 ? fullName.slice(0, sepIdx) : '';
      const originalToolName = sepIdx !== -1 ? fullName.slice(sepIdx + 2) : fullName;

      const start = Date.now();
      let result: unknown;
      let error: string | undefined;

      try {
        result = await callTool(serverId, originalToolName, parsedArgs);
      } catch (err: any) {
        error = err?.message || String(err);
        result = { error };
      }

      toolTrace.push({
        toolName: originalToolName,
        serverId,
        args: parsedArgs,
        result,
        durationMs: Date.now() - start,
        error,
      });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
  }

  return {
    reply: 'สิ้นสุดการทำงานเกินขีดจำกัดจำนวนรอบ tool call',
    toolTrace,
  };
}