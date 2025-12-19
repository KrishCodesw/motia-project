import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import { callProvider } from '../lib/ai-adapter';

const input = z.object({ requestId: z.string(), metadata: z.unknown().optional() });

export const config: EventConfig = {
  name: 'SummarizeContent',
  type: 'event',
  description: 'Creates a short summary from processed content',
  subscribes: ['content-metadata'],
  emits: ['content-summarized'],
  flows: ['content-flow'],
  input
};

export const handler: Handlers['SummarizeContent'] = async (input, { logger, state, emit }) => {
  const { requestId } = input as any;
  logger.info('SummarizeContent: received', { requestId });

  const job = (await state.get('content', requestId)) as any;
  if (!job?.result?.text) {
    logger.warn('SummarizeContent: no content to summarize', { requestId });
    return;
  }

  const text = job.result.text;
  try {
    const provider = (await state.get('ai_provider')) as string | undefined || 'primary';
    const res = await callProvider({ provider, prompt: `Summarize the following text in 2-3 sentences:\n\n${text}`, requestId, logger });

    const summary = res.text;
    await state.set('content', requestId, {
      ...job,
      summary: { text: summary, provider: res.provider, createdAt: new Date().toISOString() }
    });

    // Emit content-summarized for subsequent steps
    await emit({ topic: 'content-summarized', data: { requestId, summary } });

    logger.info('SummarizeContent: summary saved', { requestId });
  } catch (err: any) {
    logger.error('SummarizeContent: provider error', { requestId, error: err?.message ?? String(err) });
  }
};