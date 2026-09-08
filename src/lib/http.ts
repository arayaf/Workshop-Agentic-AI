// Helper functions to create JSON responses
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export function errorJson(message: string, status = 500): Response {
  return json({ error: message }, status);
}