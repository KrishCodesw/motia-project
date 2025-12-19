import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const input = z.object({ requestId: z.string(), location: z.string() });

export const config: EventConfig = {
  name: 'NotifyOnPublish',
  type: 'event',
  description: 'Sends a webhook or logs when content is published',
  subscribes: ['content-published'],
  emits: [],
  flows: ['content-flow'],
  input
};

export const handler: Handlers['NotifyOnPublish'] = async (input, { logger, state }) => {
  const { requestId, location } = input as any;
  logger.info('NotifyOnPublish: received', { requestId, location });

  const webhook = process.env.NOTIFY_WEBHOOK_URL;
  const payload = { requestId, location, timestamp: new Date().toISOString() };

  if (webhook) {
    try {
      await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      logger.info('NotifyOnPublish: webhook sent', { requestId, webhook });
    } catch (err: any) {
      logger.error('NotifyOnPublish: webhook failed', { requestId, error: err?.message ?? String(err) });
    }
    return;
  }

  // fallback: log
  logger.info('NotifyOnPublish: no webhook configured, logging payload', { payload });
};