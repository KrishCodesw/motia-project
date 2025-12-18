import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import { callProvider, ProviderError } from '../lib/ai-adapter';

const inputSchema = z.object({
  requestId: z.string(),
  inputText: z.string(),
  metadata: z.record(z.unknown()).optional()
});

export const config: EventConfig = {
  name: 'ProcessContent',
  type: 'event',
  description: 'Processes content using AI provider (primary/fallback)',
  subscribes: ['process-content'],
  emits: ['supervisor-alert'],
  flows: ['content-flow'],
  input: inputSchema
};

export const handler: Handlers['ProcessContent'] = async (input, { logger, state, emit }) => {
  const { requestId, inputText, metadata } = input;
  logger.info('ProcessContent: received', { requestId });

  // Persist original request and increment attempt count
  const existing = (await state.get('content', requestId)) as any || {};
  const attempts = (existing.attempts || 0) + 1;
  await state.set('content', requestId, {
    request: { inputText, metadata },
    attempts,
    status: 'processing',
    updatedAt: new Date().toISOString()
  });

  // Read provider preference (default to 'primary')
  const provider = (await state.get('ai_provider')) || 'primary';
  logger.info('Using provider', { provider, requestId, attempt: attempts });

  try {
    const result = await callProvider({ provider, prompt: inputText, requestId, logger });
    // Save result and mark done
    await state.set('content', requestId, {
      ...(await state.get('content', requestId)),
      result,
      status: 'done',
      completedAt: new Date().toISOString()
    });
    logger.info('ProcessContent: success', { requestId, provider });
    return;
  } catch (err: any) {
    logger.error('ProcessContent: provider error', { requestId, error: err?.message ?? String(err) });

    // If it's a provider-level critical error, emit supervisor alert and stop processing
    if (err instanceof ProviderError && (err.code === 'RATE_LIMIT' || err.code === 'OUTAGE')) {
      await emit({
        topic: 'supervisor-alert',
        data: {
          requestId,
          group: 'content',
          error: { message: err.message, code: err.code },
          originalInput: input,
          attempt: attempts
        }
      });

      // Mark as suspended/awaiting-supervisor
      await state.set('content', requestId, {
        ...(await state.get('content', requestId)),
        status: 'suspended',
        suspendedReason: { message: err.message, code: err.code },
        suspendedAt: new Date().toISOString()
      });
      return;
    }

    // Non-critical or unknown errors: rethrow so Motia's error handling can apply retries or alerts
    throw err;
  }
};
