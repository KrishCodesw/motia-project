import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const alertSchema = z.object({
  requestId: z.string(),
  group: z.string(),
  error: z.object({ message: z.string(), code: z.string() }),
  originalInput: z.unknown(),
  attempt: z.number().optional()
});

export const config: EventConfig = {
  name: 'SupervisorAgent',
  type: 'event',
  description: 'Supervisor agent that handles critical provider failures and reroutes to fallback',
  subscribes: ['supervisor-alert'],
  emits: ['process-content'],
  flows: ['supervisor-flow'],
  input: alertSchema
};

export const handler: Handlers['SupervisorAgent'] = async (alert, { logger, state, emit }) => {
  const { requestId, group, error, originalInput, attempt = 1 } = alert;
  logger.info('SupervisorAgent: received alert', { requestId, group, error, attempt });

  const MAX_ATTEMPTS = Number(process.env.SUPERVISOR_MAX_ATTEMPTS || 3);

  // Fetch the stored job to avoid re-processing completed jobs
  const job = await state.get(group, requestId) as any;
  if (job?.status === 'done') {
    logger.info('SupervisorAgent: job already completed', { requestId });
    return;
  }

  // Increase attempt counter at the job level
  const attempts = Math.max(job?.attempts || 0, attempt);
  if (attempts >= MAX_ATTEMPTS) {
    logger.warn('SupervisorAgent: max attempts exceeded, marking failed', { requestId, attempts, max: MAX_ATTEMPTS });
    await state.set(group, requestId, {
      ...job,
      status: 'failed',
      failedAt: new Date().toISOString(),
      failure: { message: error.message, code: error.code },
      attempts
    });
    return;
  }

  // Reroute traffic to fallback provider
  const prev = await state.get('ai_provider');
  await state.set('ai_provider', 'fallback');
  logger.info('SupervisorAgent: switched ai_provider to fallback', { requestId, prevProvider: prev });

  // Persist supervisor action (audit)
  await state.set('supervisor', `${requestId}-${Date.now()}`, {
    requestId,
    action: 'set_provider',
    newProvider: 'fallback',
    reason: error,
    timestamp: new Date().toISOString()
  });

  // Re-emit original event so processing resumes
  await emit({
    topic: `${group === 'content' ? 'process-content' : group}`,
    data: originalInput
  });
  logger.info('SupervisorAgent: re-emitted original event', { requestId, reemitTopic: 'process-content', attempt: attempts + 1 });

  // Update the job attempt counter and status
  await state.set(group, requestId, {
    ...job,
    attempts: attempts + 1,
    status: 'resubmitted',
    lastSupervisorActionAt: new Date().toISOString()
  });
};