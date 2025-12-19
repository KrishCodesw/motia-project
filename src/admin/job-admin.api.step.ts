import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'JobAdminAPI',
  type: 'api',
  path: '/admin/jobs/:id',
  method: 'POST',
  description: 'Admin actions on jobs: reprocess or abort',
  emits: ['process-content'],
  responseSchema: {
    200: z.object({ success: z.boolean(), action: z.string() })
  }
};

const bodySchema = z.object({ action: z.enum(['reprocess', 'abort']) });

export const handler: Handlers['JobAdminAPI'] = async (req, { state, emit, logger }) => {
  const requestId = req.params?.id as string;
  const body = bodySchema.parse(req.body);

  logger.info('JobAdminAPI: admin action', { requestId, action: body.action });

  const job = (await state.get('content', requestId)) as any;
  if (!job) {
    return { status: 404, body: { message: 'Job not found' } } as any;
  }

  if (body.action === 'abort') {
    await state.set('content', requestId, {
      ...job,
      status: 'failed',
      failedAt: new Date().toISOString(),
      failure: { message: 'Aborted by admin' }
    });
    return { status: 200, body: { success: true, action: 'abort' } };
  }

  if (body.action === 'reprocess') {
    // Only allow reprocess if job not done
    if (job?.status === 'done') {
      return { status: 400, body: { message: 'Cannot reprocess a completed job' } } as any;
    }

    // Reset status and re-emit
    await state.set('content', requestId, {
      ...job,
      status: 'resubmitted',
      lastAdminActionAt: new Date().toISOString()
    });

    await emit({ topic: 'process-content', data: job.request });
    return { status: 200, body: { success: true, action: 'reprocess' } };
  }

  return { status: 400, body: { message: 'Unknown action' } } as any;
};
