import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'HealthAPI',
  type: 'api',
  path: '/health',
  method: 'GET',
  description: 'Health and readiness endpoint',
  emits: [],
  responseSchema: {
    200: z.object({ status: z.string(), uptime: z.number(), provider: z.string(), appName: z.string() })
  }
};

export const handler: Handlers['HealthAPI'] = async (_, { state }) => {
  const uptime = process.uptime();
  const provider = (await state.get('ai_provider')) as string | undefined || 'primary';
  const appName = process.env.APP_NAME || 'Motia App';

  return {
    status: 200,
    body: {
      status: 'ok',
      uptime,
      provider,
      appName
    }
  };
};
