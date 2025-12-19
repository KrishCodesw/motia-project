import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

const bodySchema = z.object({ provider: z.enum(['primary', 'fallback', 'openai', 'anthropic']) });

export const config: ApiRouteConfig = {
  name: 'AdminSetProviderAPI',
  type: 'api',
  path: '/admin/provider',
  method: 'POST',
  description: 'Set the AI provider (admin)',
  emits: [],
  responseSchema: {
    200: z.object({ success: z.boolean(), provider: z.string() })
  }
};

export const handler: Handlers['AdminSetProviderAPI'] = async (req, { state, logger }) => {
  const body = bodySchema.parse(req.body);
  const prev = await state.get('ai_provider') as string | undefined;

  await state.set('ai_provider', body.provider);

  // audit
  await state.set('supervisor', `provider-change-${Date.now()}`, {
    prevProvider: prev,
    newProvider: body.provider,
    changedAt: new Date().toISOString()
  });

  logger.info('AdminSetProviderAPI: provider changed', { prev, newProvider: body.provider });
  return { status: 200, body: { success: true, provider: body.provider } };
};
