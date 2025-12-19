import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const input = z.object({ requestId: z.string() });

export const config: EventConfig = {
  name: 'PublishContent',
  type: 'event',
  description: 'Simulate publishing of approved content and emit content-published',
  subscribes: ['content-moderated'],
  emits: ['content-published'],
  flows: ['content-flow'],
  input
};

export const handler: Handlers['PublishContent'] = async (input, { logger, state, emit }) => {
  const { requestId } = input as any;
  logger.info('PublishContent: attempting to publish', { requestId });

  const job = (await state.get('content', requestId)) as any;
  if (!job) {
    logger.warn('PublishContent: job not found', { requestId });
    return;
  }

  if (job.status === 'suspended' || job.status === 'failed') {
    logger.warn('PublishContent: job not in publishable state', { requestId, status: job.status });
    return;
  }

  // Simulate publishing (e.g., generating a public URL)
  const location = `https://content.example.com/${requestId}`;
  await state.set('content', requestId, {
    ...job,
    status: 'published',
    publishedAt: new Date().toISOString(),
    location
  });

  await emit({ topic: 'content-published', data: { requestId, location } });
  logger.info('PublishContent: published', { requestId, location });
};