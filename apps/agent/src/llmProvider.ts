// Thin client for OpenAI-compatible chat-completions endpoints. Only Groq is
// wired up today, but "provider" is a config lookup (baseURL + which env var
// holds the key), not a class hierarchy — swapping in another OpenAI-
// compatible host later is one more PROVIDERS entry, not a rewrite. This is
// the only file that reads GROQ_API_KEY; the key is never logged.

interface ProviderConfig {
  baseURL: string;
  apiKeyEnv: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  groq: { baseURL: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY" },
};

const TIMEOUT_MS = 20_000;

export function currentProvider(): string {
  return process.env.LLM_PROVIDER ?? "groq";
}

export function currentModel(): string {
  return process.env.LLM_MODEL ?? "openai/gpt-oss-20b";
}

/** Thrown on HTTP 429 specifically, so a rate-limit response can never be mistaken for a parsed decision by a generic catch. */
export class LLMRateLimitedError extends Error {}

export class LLMProviderError extends Error {}

/**
 * Calls <provider>/chat/completions with a strict JSON-schema response
 * format and returns the raw message content string. This layer only knows
 * about HTTP, timeouts, and rate limits — llmBrain.ts owns what the JSON
 * means and validates it before anything becomes a transaction request.
 */
export async function chatJSON(args: {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<string> {
  const providerName = currentProvider();
  const config = PROVIDERS[providerName];
  if (!config) {
    throw new LLMProviderError(`llm brain: unknown LLM_PROVIDER "${providerName}"`);
  }
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new LLMProviderError(`llm brain: ${config.apiKeyEnv} is not set`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: currentModel(),
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: args.schemaName, strict: true, schema: args.schema },
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new LLMProviderError(`llm brain: request to ${providerName} timed out after ${TIMEOUT_MS}ms`);
    }
    throw new LLMProviderError(`llm brain: network error calling ${providerName}: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 429) {
    throw new LLMRateLimitedError(`llm brain: ${providerName} rate-limited this request (429) — space out runs and retry later`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LLMProviderError(`llm brain: ${providerName} returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMProviderError(`llm brain: empty response from ${providerName}`);
  }
  return content;
}
