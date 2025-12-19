import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const input = z.object({
  requestId: z.string(),
  result: z.object({ text: z.string(), provider: z.string(), raw: z.unknown().optional() }).optional(),
  metadata: z.unknown().optional()
});

export const config: EventConfig = {
  name: 'MetadataExtraction',
  type: 'event',
  description: 'Extracts metadata (word count, keywords stub) from processed content',
  subscribes: ['content-processed'],
  emits: ['content-metadata'],
  flows: ['content-flow'],
  input
};

export const handler: Handlers['MetadataExtraction'] = async (input, { logger, state, emit }) => {
  const { requestId, result } = input as any;
  logger.info('MetadataExtraction: processing', { requestId });

  const text = result?.text ?? '';
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // simple keyword extraction stub: pick the longest words as "keywords"
  const keywords = [...new Set(text.match(/\b\w{5,}\b/g) || [])].slice(0, 5);

  const metadata = { wordCount, keywords };

  // Persist as part of content job state
  const job = (await state.get('content', requestId)) as any;
  await state.set('content', requestId, {
    ...job,
    metadata: {
      ...(job?.metadata || {}),
      ...metadata
    },
    updatedAt: new Date().toISOString()
  });

  // Emit content-metadata for downstream processing
  await emit({ topic: 'content-metadata', data: { requestId, metadata } });
  logger.info('MetadataExtraction: completed', { requestId, metadata });
};