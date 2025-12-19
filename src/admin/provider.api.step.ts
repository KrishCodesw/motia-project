import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'AdminProviderAPI',
  type: 'api',
  path: '/admin/provider',
  method: 'GET',
  description: 'Get current AI provider setting',
  emits: [],
  responseSchema: {
    200: z.object({ provider: z.string() })
  }
};

export const handler: Handlers['AdminProviderAPI'] = async (_, { state }) => {
  const provider = (await state.get('ai_provider')) as string | undefined;
  return { status: 200, body: { provider: provider || 'primary' } };
};
