import type { SpeechResult } from "@/lib/domain/types";

/**
 * Speech-to-text abstraction. Swapping the transcription vendor only requires
 * a new `SpeechProvider` implementation.
 */
export interface SpeechProvider {
  readonly name: string;
  transcribe(audio: Blob, fileName: string, durationSeconds: number): Promise<SpeechResult>;
}

export class SpeechProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SpeechProviderError";
  }
}

const TRANSCRIPTION_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MIN_AUDIO_BYTES = 2048;

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

class LovableAiSpeechProvider implements SpeechProvider {
  readonly name = "lovable-ai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async transcribe(
    audio: Blob,
    fileName: string,
    durationSeconds: number,
  ): Promise<SpeechResult> {
    if (audio.size < MIN_AUDIO_BYTES) {
      throw new SpeechProviderError(
        "The recording contained no audible speech. Please record again.",
        400,
      );
    }

    const form = new FormData();
    form.append("model", this.model);
    form.append("file", audio, fileName);
    form.append("stream", "true");

    const response = await fetch(TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new SpeechProviderError(
        response.status === 429
          ? "Transcription rate limit reached. Please retry shortly."
          : response.status === 402
            ? "AI credits exhausted for this workspace."
            : `Transcription failed (${response.status}): ${detail.slice(0, 300)}`,
        response.status || 502,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let transcript = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]" || data.length === 0) continue;
        try {
          const event = JSON.parse(data) as {
            type?: string;
            delta?: string;
            text?: string;
          };
          if (event.type === "transcript.text.delta" && event.delta) {
            transcript += event.delta;
          } else if (event.type === "transcript.text.done" && event.text) {
            transcript = event.text;
          }
        } catch {
          // Ignore malformed keep-alive fragments.
        }
      }
    }

    const clean = transcript.trim();
    return {
      transcript: clean,
      language: null,
      confidence: clean.length > 0 ? 0.9 : 0,
      wordCount: countWords(clean),
      speechDurationSeconds: durationSeconds,
    };
  }
}

export function resolveSpeechProvider(): SpeechProvider {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new SpeechProviderError("Speech-to-text is not configured on the server", 500);
  }
  return new LovableAiSpeechProvider(
    apiKey,
    process.env["STT_MODEL"] ?? "openai/gpt-4o-mini-transcribe",
  );
}
