import { Env } from './env';
import { json } from './lib/http';
import { handleChatRoute } from './module-1.1-chat/chat-routes';

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/healthz') {
    return json({ ok: true, status: 'healthy' });
  }

  if (pathname === '/api/chat') {
    return handleChatRoute(request, env);
  }

  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response('Not Found', { status: 404 });
}