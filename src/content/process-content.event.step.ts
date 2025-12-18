import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import { callProvider, ProviderError } from '../lib/ai-adapter';

const inputSchema = z.object({
  requestId: z.string().optional(),
  inputText: z.string(),
  metadata: z.unknown().optional()
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

  // Idempotency: if job already completed, skip
  if (existing.status === 'done') {
    logger.info('ProcessContent: job already completed, skipping', { requestId });
    return;
  }

  const attempts = (existing.attempts || 0) + 1;
  await state.set('content', requestId, {
    request: { inputText, metadata },
    attempts,
    status: 'processing',
    updatedAt: new Date().toISOString()
  });

  // Read provider preference (default to 'primary')
  let provider = (await state.get('ai_provider')) as string | undefined;
  if (!provider) {
    provider = 'primary';
    await state.set('ai_provider', 'primary');
    logger.info('ProcessContent: setting default ai_provider to primary', { requestId });
  }

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
    // Enhanced error handling: log stack and prepare structured error for supervisor
    logger.error('ProcessContent: provider error or unexpected failure', { requestId, error: err?.message ?? String(err), stack: err?.stack });

    const MAX_PROCESS_ATTEMPTS = Number(process.env.PROCESS_MAX_ATTEMPTS || 3);

    // If it's a provider-level critical error, emit supervisor alert and stop processing
    if (err instanceof ProviderError && (err.code === 'RATE_LIMIT' || err.code === 'OUTAGE')) {
      await emit({
        topic: 'supervisor-alert',
        data: {
          requestId,
          group: 'content',
          error: { message: err.message, code: err.code, stack: err?.stack },
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

    // For other/unexpected errors, allow the supervisor to inspect and possibly reroute on early attempts
    const errorCode = err instanceof ProviderError ? err.code : 'UNKNOWN';

    if (attempts >= MAX_PROCESS_ATTEMPTS) {
      // Mark job as failed to avoid endless retries and DLQ noise
      logger.warn('ProcessContent: max attempts exceeded, marking job failed', { requestId, attempts, max: MAX_PROCESS_ATTEMPTS });
      await state.set('content', requestId, {
        ...(await state.get('content', requestId)),
        status: 'failed',
        failedAt: new Date().toISOString(),
        failure: { message: err?.message ?? String(err), code: errorCode, stack: err?.stack },
        attempts
      });
      return;
    }

    // Otherwise emit a supervisor alert with UNKNOWN code so supervisor can decide to reroute
    await emit({
      topic: 'supervisor-alert',
      data: {
        requestId,
        group: 'content',
        error: { message: err?.message ?? String(err), code: errorCode, stack: err?.stack },
        originalInput: input,
        attempt: attempts
      }
    });

    // Mark job as suspended while supervisor investigates
    await state.set('content', requestId, {
      ...(await state.get('content', requestId)),
      status: 'suspended',
      suspendedReason: { message: err?.message ?? String(err), code: errorCode },
      suspendedAt: new Date().toISOString()
    });
    return;
  }
};
