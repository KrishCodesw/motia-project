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
   Provider-specific implementations
   -------------------------
   Strategy:
   - If the corresponding API key env var is set, attempt a dynamic import of the
     official SDK and call it.
   - If dynamic import fails (SDK not installed) or key missing, fall back to the
     original stub implementation so the project remains runnable.
*/

async function callOpenAI({ prompt, requestId, logger }: { prompt: string; requestId?: string; logger?: any }): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      // Dynamic import to avoid a hard dependency
      const mod: any = await import('openai').catch(() => null);
      const OpenAIClass = mod?.OpenAI ?? mod?.default?.OpenAI ?? mod?.default;
      if (OpenAIClass) {
        const client = new OpenAIClass({ apiKey: key });
        logger?.info?.('ai-adapter: calling OpenAI SDK', { requestId });

        // Attempt a minimal request - adapt to the SDK available
        if (client.responses && typeof client.responses.create === 'function') {
          const res: any = await client.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: prompt });
          const text = res.output?.[0]?.content?.[0]?.text ?? JSON.stringify(res);
          return { text: String(text), provider: 'openai', raw: res };
        }
        if (typeof client.createCompletion === 'function') {
          const res: any = await client.createCompletion({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', prompt, max_tokens: 512 });
          const text = res?.choices?.[0]?.text ?? JSON.stringify(res);
          return { text: String(text), provider: 'openai', raw: res };
        }
      }
    } catch (err: any) {
      logger?.warn?.('ai-adapter: openai SDK call failed, falling back to stub', { error: err?.message ?? String(err) });
      if (err?.status === 429) throw new ProviderError('Rate limited by OpenAI', 'RATE_LIMIT', { original: err });
      if (err?.status && err.status >= 500) throw new ProviderError('OpenAI outage', 'OUTAGE', { original: err });
    }
  }

  // Stub behavior
  logger?.info?.('ai-adapter: openai stub response', { requestId });
  return { text: `OpenAI (stub): ${prompt.slice(0, 400)}`, provider: 'openai' };
}

async function callAnthropic({ prompt, requestId, logger }: { prompt: string; requestId?: string; logger?: any }): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      // Try common Anthropic SDKs
      const mod: any = await import('@anthropic-ai/sdk').catch(() => import('anthropic').catch(() => null));
      const AnthropicClass = mod?.Anthropic ?? mod?.default ?? null;
      if (AnthropicClass) {
        logger?.info?.('ai-adapter: calling Anthropic SDK', { requestId });
        const client = new AnthropicClass({ apiKey: key });
        // Try a couple of typical methods
        if (typeof client.complete === 'function') {
          const res: any = await client.complete({ model: process.env.ANTHROPIC_MODEL || 'claude-2.1', prompt });
          const text = res?.completion ?? JSON.stringify(res);
          return { text: String(text), provider: 'anthropic', raw: res };
        }
        if (typeof client.generateText === 'function') {
          const res: any = await client.generateText({ model: process.env.ANTHROPIC_MODEL || 'claude-2.1', prompt });
          const text = res?.text ?? JSON.stringify(res);
          return { text: String(text), provider: 'anthropic', raw: res };
        }
      }
    } catch (err: any) {
      logger?.warn?.('ai-adapter: anthropic SDK call failed, falling back to stub', { error: err?.message ?? String(err) });
      if (err?.status === 429) throw new ProviderError('Rate limited by Anthropic', 'RATE_LIMIT', { original: err });
      if (err?.status && err.status >= 500) throw new ProviderError('Anthropic outage', 'OUTAGE', { original: err });
    }
  }

  logger?.info?.('ai-adapter: anthropic stub response', { requestId });
  return { text: `Anthropic (stub): ${prompt.slice(0, 400)}`, provider: 'anthropic' };
}