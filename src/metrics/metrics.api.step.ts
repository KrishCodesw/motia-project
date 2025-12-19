import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';

export const config: ApiRouteConfig = {
  name: 'MetricsAPI',
  type: 'api',
  path: '/metrics',
  method: 'GET',
  description: 'Expose simple textual metrics (Prometheus-style)',
  emits: [],
  responseSchema: {
    200: z.string()
  }
};

export const handler: Handlers['MetricsAPI'] = async (_req, { state }) => {
  const uptime = Math.floor(process.uptime());
  const provider = (await state.get('ai_provider')) as string | undefined || 'primary';
  const appName = process.env.APP_NAME || 'motia_app';

  const metrics = [];
  metrics.push(`# HELP app_uptime_seconds Process uptime in seconds`);
  metrics.push(`# TYPE app_uptime_seconds gauge`);
  metrics.push(`app_uptime_seconds ${uptime}`);
  metrics.push(`# HELP app_info Basic app info`);
  metrics.push(`# TYPE app_info gauge`);
  metrics.push(`app_info{app="${appName}",provider="${provider}"} 1`);

  return { status: 200, body: metrics.join('\n') };
};
