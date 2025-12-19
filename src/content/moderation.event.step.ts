import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const input = z.object({ requestId: z.string(), summary: z.object({ text: z.string() }).optional() });

export const config: EventConfig = {
  name: 'ContentModeration',
  type: 'event',
  description: 'Simple moderation scan — flags banned words and emits supervisor alerts for severe content',
  subscribes: ['content-summarized'],
  emits: ['moderation-alert', 'content-moderated', 'supervisor-alert'],
  flows: ['content-flow'],
  input
};

export const handler: Handlers['ContentModeration'] = async (input, { logger, state, emit }) => {
  const { requestId } = input as any;
  logger.info('ContentModeration: checking content', { requestId });

  const job = (await state.get('content', requestId)) as any;
  const text = job?.summary?.text ?? job?.result?.text ?? '';

  const bannedEnv = process.env.BANNED_WORDS || 'spam,scam,illegal';
  const banned = bannedEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const found = banned.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
  if (found.length > 0) {
    const reason = { message: `Banned words detected: ${found.join(', ')}`, code: 'MODERATION' };

    await state.set('content', requestId, {
      ...job,
      status: 'suspended',
      suspendedReason: reason,
      suspendedAt: new Date().toISOString()
    });

    // Emit moderation-alert and supervisor-alert so humans can review
    await emit({ topic: 'moderation-alert', data: { requestId, found } });
    await emit({ topic: 'supervisor-alert', data: { requestId, group: 'content', error: reason, originalInput: job.request, attempt: job?.attempts || 1 } });

    logger.warn('ContentModeration: content flagged', { requestId, found });
    return;
  }

  // OK — emit content-moderated
  await emit({ topic: 'content-moderated', data: { requestId } });
  logger.info('ContentModeration: content OK', { requestId });
};