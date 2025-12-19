# Provider SDKs & Environment

This project includes an `ai-adapter` that can call OpenAI and Anthropic providers.

Quick setup:

1. Copy `.env.example` to `.env` and set your keys:

```bash
cp .env.example .env
# set OPENAI_API_KEY and/or ANTHROPIC_API_KEY
```

2. Install SDKs (optional):

- OpenAI: `npm install openai`
- Anthropic: `npm install @anthropic-ai/sdk` or `npm install anthropic`

Behavior:
- If the corresponding API key is set and the SDK is installed, the adapter will attempt a real API call.
- If the SDK is not installed or the key is missing, the adapter safely falls back to a local stub so development is still possible.

Errors from SDKs are normalized into `ProviderError` with codes: `RATE_LIMIT`, `OUTAGE`, or `OTHER`.

If you want the runtime to fail-fast when keys are missing, add your own validation at startup or contact me to enable strict env validation.
