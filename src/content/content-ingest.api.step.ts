import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'ContentIngestAPI',
  type: 'api',
  path: '/ingest',
  method: 'POST',
  description: 'Receives raw input for content processing and emits process-content event',
  emits: ['process-content'],
  flows: ['content-flow'],
  responseSchema: {
    200: z.object({
      requestId: z.string(),
      status: z.string()
    })
  }
};

export const handler: Handlers['ContentIngestAPI'] = async (req, { emit, logger }) => {
  const body = req.body as { inputText: string; metadata?: Record<string, any> };
  const requestId = Math.random().toString(36).substring(2, 10);
  logger.info('Content ingest received', { requestId });

  await emit({
    topic: 'process-content',
    data: {
      requestId,
      inputText: body.inputText,
      metadata: body.metadata
    }
  });

  return {
    status: 200,
    body: { requestId, status: 'accepted' }
  };
};
