import { route } from './router';

export interface ServiceWorkerGlobalScope {
  fetch: typeof fetch;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return route(request, env);
  },
};