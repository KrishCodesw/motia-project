export class ProviderError extends Error {
  code: 'RATE_LIMIT' | 'OUTAGE' | 'OTHER';
  details?: any;
  constructor(message: string, code: ProviderError['code'] = 'OTHER', details?: any) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.details = details;
  }
}

export type ProviderResult = {
  text: string;
  provider: string;
  raw?: any;
};

/**
 * Call the configured provider. This implementation does NOT simulate failures.
 * Replace the callOpenAI / callAnthropic stubs with real SDK calls.
 */
export async function callProvider(opts: {
  provider: string;
  prompt: string;
  requestId?: string;
  logger?: { info?: Function; warn?: Function; error?: Function };
}): Promise<ProviderResult> {
  const { provider, prompt, requestId, logger } = opts;
  logger?.info?.('ai-adapter: callProvider', { provider, requestId });

  try {
    if (provider === 'openai' || provider === 'primary') {
      return await callOpenAI({ prompt, requestId, logger });
    }
    if (provider === 'anthropic' || provider === 'fallback') {
      return await callAnthropic({ prompt, requestId, logger });
    }
    throw new ProviderError(`Unsupported provider: ${provider}`, 'OTHER');
  } catch (err: any) {
    // Normalize common provider errors into ProviderError so callers can react deterministically
    if (err?.status === 429 || err?.code === 'RateLimitError') {
      throw new ProviderError('Rate limited by provider', 'RATE_LIMIT', { original: err });
    }
    if ((err?.status && err.status >= 500) || err?.code === 'ServiceUnavailable') {
      throw new ProviderError('Provider outage', 'OUTAGE', { original: err });
    }
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(err?.message ?? String(err), 'OTHER', { original: err });
  }
}

/* -------------------------
   Provider-specific stubs
   -------------------------
   Replace these with actual SDK calls that use environment keys
   (e.g., process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY).
   Keep them simple and throw provider-specific errors so the
   wrapper can map them to RATE_LIMIT / OUTAGE if needed.
*/

async function callOpenAI({ prompt, requestId, logger }: { prompt: string; requestId?: string; logger?: any }): Promise<ProviderResult> {
  // TODO: Replace with OpenAI SDK call.
  logger?.info?.('ai-adapter: openai stub response', { requestId });
  return { text: `OpenAI (stub): ${prompt.slice(0, 400)}`, provider: 'openai' };
}

async function callAnthropic({ prompt, requestId, logger }: { prompt: string; requestId?: string; logger?: any }): Promise<ProviderResult> {
  // TODO: Replace with Anthropic SDK call.
  logger?.info?.('ai-adapter: anthropic stub response', { requestId });
  return { text: `Anthropic (stub): ${prompt.slice(0, 400)}`, provider: 'anthropic' };
}