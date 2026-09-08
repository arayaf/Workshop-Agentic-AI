import { ChatMessage, McpTool, ToolCaller, ToolTraceEntry, toolFunctionName } from '../types';
import { toGeminiSchema } from '../tool-schema';

export interface GeminiConversationParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: ChatMessage[];
  tools: McpTool[];
  callTool: ToolCaller;
}

export async function runGeminiConversation(
  params: GeminiConversationParams
): Promise<{ reply: string; toolTrace: ToolTraceEntry[] }> {
  const { apiKey, model, systemPrompt, history, tools, callTool } = params;

  if (!apiKey || !apiKey.trim()) {
    return {
      reply: 'ยังไม่ได้ตั้งค่า API Key สำหรับ Gemini (GEMINI_API_KEY)',
      toolTrace: [],
    };
  }

  const toolTrace: ToolTraceEntry[] = [];

  // Convert tools to Gemini function declarations
  const functionDeclarations = tools.map((tool) => ({
    name: toolFunctionName(tool.serverId, tool.name),
    description: tool.description || '',
    parameters: tool.inputSchema ? toGeminiSchema(tool.inputSchema) : undefined,
  }));

  // Build initial contents from history
  const contents: any[] = history.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Max 4 loops for tool calling
  const MAX_ROUNDS = 4;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const bodyPayload: any = {
      contents,
    };

    if (systemPrompt) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    if (functionDeclarations.length > 0) {
      bodyPayload.tools = [{ functionDeclarations }];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        reply: `เกิดข้อผิดพลาดในการเรียก Gemini API (${res.status}): ${errText}`,
        toolTrace,
      };
    }

    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content) {
      return {
        reply: 'ไม่ได้รับคำตอบจากโมเดล Gemini',
        toolTrace,
      };
    }

    const contentObj = candidate.content;
    contents.push(contentObj);

    const parts = contentObj.parts || [];
    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length === 0 || round === MAX_ROUNDS) {
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      return {
        reply: textParts.join('\n') || '',
        toolTrace,
      };
    }

    // Execute function calls
    const responseParts: any[] = [];
    for (const fcPart of functionCalls) {
      const call = fcPart.functionCall;
      const fullName = call.name as string;
      const args = (call.args || {}) as Record<string, unknown>;

      const sepIdx = fullName.indexOf('__');
      const serverId = sepIdx !== -1 ? fullName.slice(0, sepIdx) : '';
      const originalToolName = sepIdx !== -1 ? fullName.slice(sepIdx + 2) : fullName;

      const start = Date.now();
      let result: unknown;
      let error: string | undefined;

      try {
        result = await callTool(serverId, originalToolName, args);
      } catch (err: any) {
        error = err?.message || String(err);
        result = { error };
      }

      toolTrace.push({
        toolName: originalToolName,
        serverId,
        args,
        result,
        durationMs: Date.now() - start,
        error,
      });

      responseParts.push({
        functionResponse: {
          name: fullName,
          response: {
            result,
          },
        },
      });
    }

    contents.push({
      role: 'function',
      parts: responseParts,
    });
  }

  return {
    reply: 'สิ้นสุดการทำงานเกินขีดจำกัดจำนวนรอบ tool call',
    toolTrace,
  };
}