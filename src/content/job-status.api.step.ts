import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'JobStatusAPI',
  type: 'api',
  path: '/jobs/:id',
  method: 'GET',
  description: 'Get job status and details from state',
  emits: [],
  responseSchema: {
    200: z.object({
      requestId: z.string(),
      status: z.string(),
      attempts: z.number().optional(),
      result: z.unknown().optional(),
      suspendedReason: z.unknown().optional()
    })
  }
};

export const handler: Handlers['JobStatusAPI'] = async (req, { logger, state }) => {
  const requestId = req.params?.id as string;
  logger.info('JobStatusAPI: fetching job status', { requestId });

  const job = (await state.get('content', requestId)) as any;
  if (!job) {
    return { status: 404, body: { message: 'Job not found' } } as any;
  }

  return {
    status: 200,
    body: {
      requestId,
      status: job.status,
      attempts: job.attempts,
      result: job.result,
      suspendedReason: job.suspendedReason
    }
  };
};