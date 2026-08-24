import { createFileRoute } from "@tanstack/react-router";

/**
 * Interviewer voice endpoint. Returns a complete mp3 for one question so the
 * browser can play it with a plain <audio> element and know exactly when the
 * question has finished being spoken.
 */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let text = "";
        try {
          const body = (await request.json()) as { text?: unknown };
          text = typeof body.text === "string" ? body.text.trim() : "";
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        if (text.length === 0) return new Response("Missing text", { status: 400 });
        if (text.length > 1200) text = text.slice(0, 1200);

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Voice service is not configured", { status: 503 });

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice: "alloy",
              instructions:
                "Speak as a calm, professional technical interviewer: clear, unhurried, friendly.",
              response_format: "mp3",
              stream_format: "audio",
            }),
          });

          if (!upstream.ok) {
            const detail = await upstream.text().catch(() => "");
            console.error("TTS upstream failure", upstream.status, detail.slice(0, 500));
            return new Response(detail || "Voice generation failed", { status: upstream.status });
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "private, no-store",
            },
          });
        } catch (error) {
          console.error("TTS route error", error);
          return new Response("Voice generation failed", { status: 502 });
        }
      },
    },
  },
});
