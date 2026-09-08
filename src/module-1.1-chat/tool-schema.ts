export function toGeminiSchema(schema: unknown): any {
  if (!schema || typeof schema !== 'object') {
    return { type: 'STRING' };
  }
  const s = schema as Record<string, any>;
  const result: Record<string, any> = {};

  if (s.type) {
    const t = String(s.type).toUpperCase();
    if (t === 'OBJECT' || t === 'ARRAY' || t === 'STRING' || t === 'NUMBER' || t === 'INTEGER' || t === 'BOOLEAN') {
      result.type = t;
    } else {
      result.type = 'STRING';
    }
  } else if (s.properties) {
    result.type = 'OBJECT';
  }

  if (s.description) {
    result.description = s.description;
  }

  if (s.properties && typeof s.properties === 'object') {
    result.properties = {};
    for (const [key, val] of Object.entries(s.properties)) {
      result.properties[key] = toGeminiSchema(val);
    }
  }

  if (Array.isArray(s.required)) {
    result.required = s.required;
  }

  if (s.items) {
    result.items = toGeminiSchema(s.items);
  }

  return result;
}