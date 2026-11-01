/**
 * LLM provider abstraction.
 *
 * The rest of the system depends only on `LlmProvider`, so the underlying
 * model vendor can be swapped (Lovable AI gateway, self-hosted Ollama, ...)
 * without touching services, repositories, or routes.
 */

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmJsonRequest {
  messages: LlmMessage[];
  /** JSON Schema describing the expected response object. */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  completeJson<T>(request: LlmJsonRequest): Promise<T>;
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function parseJsonContent<T>(raw: string, providerName: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new LlmProviderError(`${providerName} returned non-JSON output`, 502);
  }
}

/** Primary provider: Lovable AI gateway (OpenAI-compatible, no user key). */
class LovableAiProvider implements LlmProvider {
  readonly name = "lovable-ai";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async completeJson<T>(request: LlmJsonRequest): Promise<T> {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 1400,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new LlmProviderError(
        response.status === 429
          ? "AI rate limit reached. Please retry in a moment."
          : response.status === 402
            ? gatewayErrorMessage(detail, "AI credits exhausted for this workspace.")
            : `AI evaluation failed (${response.status}): ${detail.slice(0, 300)}`,
        response.status,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new LlmProviderError("AI returned an empty evaluation", 502);
    return parseJsonContent<T>(content, this.name);
  }
}

/** Secondary provider: self-hosted Ollama, used when OLLAMA_BASE_URL is set. */
class OllamaProvider implements LlmProvider {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  async completeJson<T>(request: LlmJsonRequest): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        messages: request.messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new LlmProviderError(
        `Ollama evaluation failed (${response.status}): ${detail.slice(0, 300)}`,
        response.status,
      );
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content) throw new LlmProviderError("Ollama returned an empty evaluation", 502);
    return parseJsonContent<T>(content, this.name);
  }
}

/**
 * Resolves the active LLM provider. Called inside server-function handlers so
 * environment variables are read at request time.
 */
export function resolveLlmProvider(): LlmProvider {
  const ollamaUrl = process.env["OLLAMA_BASE_URL"];
  if (ollamaUrl) {
    return new OllamaProvider(ollamaUrl, process.env["OLLAMA_MODEL"] ?? "llama3.1");
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new LlmProviderError("No LLM provider is configured on the server", 500);
  }
  return new LovableAiProvider(apiKey, process.env["LLM_MODEL"] ?? "google/gemini-3.5-flash");
}
