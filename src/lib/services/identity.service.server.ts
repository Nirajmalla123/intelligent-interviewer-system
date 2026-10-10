import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** A verification is valid for this long before the interview must start. */
export const IDENTITY_VALID_MINUTES = 30;
const MIN_CONFIDENCE = 0.75;

export interface IdentityResult {
  verified: boolean;
  confidence: number;
  reason: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["live_face_count", "reference_face_count", "same_person", "confidence", "reason"],
  properties: {
    live_face_count: { type: "integer" },
    reference_face_count: { type: "integer" },
    same_person: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Compares a live webcam snapshot with the candidate's registered profile
 * photo using a vision model, and records the outcome server-side.
 */
export async function verifyIdentity(userId: string, liveImageDataUrl: string): Promise<IdentityResult> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const avatarPath = (profile as { avatar_url?: string | null } | null)?.avatar_url;
  if (!avatarPath) {
    return { verified: false, confidence: 0, reason: "Upload a profile photo first, then verify." };
  }
  const { data: file, error } = await supabaseAdmin.storage.from("avatars").download(avatarPath);
  if (error || !file) {
    return { verified: false, confidence: 0, reason: "Your profile photo could not be loaded." };
  }
  const refUrl = `data:${file.type || "image/jpeg"};base64,${toBase64(new Uint8Array(await file.arrayBuffer()))}`;

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Identity verification is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            "You are a strict face-verification system for interview security. Image 1 is the registered profile photo, image 2 is a live webcam capture. Count clearly visible human faces in each image. Decide if both show the same real person, judging stable facial features (face shape, eyes, nose, mouth, ears, hairline) and ignoring lighting, angle, glasses, or expression. Photos of a screen or printed photo held to the camera are NOT a match. Be conservative: if unsure, same_person=false. confidence is 0..1.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Image 1: registered profile photo." },
            { type: "image_url", image_url: { url: refUrl } },
            { type: "text", text: "Image 2: live webcam capture." },
            { type: "image_url", image_url: { url: liveImageDataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "face_verification", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Verification is busy. Please retry in a moment."
        : response.status === 402
          ? "AI credits exhausted for this workspace."
          : `Identity verification failed (${response.status})`,
    );
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  let parsed: {
    live_face_count: number;
    reference_face_count: number;
    same_person: boolean;
    confidence: number;
    reason: string;
  };
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, ""));
  } catch {
    throw new Error("Identity verification returned an unreadable result");
  }

  let result: IdentityResult;
  if (parsed.live_face_count !== 1) {
    result = {
      verified: false,
      confidence: 0,
      reason:
        parsed.live_face_count === 0
          ? "No face was detected in the camera. Face the camera in good light."
          : "More than one face is visible. Only you should be in the frame.",
    };
  } else if (parsed.reference_face_count < 1) {
    result = { verified: false, confidence: 0, reason: "Your profile photo has no clear face. Upload a clear photo of yourself." };
  } else {
    const ok = parsed.same_person && parsed.confidence >= MIN_CONFIDENCE;
    result = {
      verified: ok,
      confidence: parsed.confidence,
      reason: ok ? "Identity verified." : "Your face does not match your profile photo.",
    };
  }

  await supabaseAdmin.from("identity_verifications").insert({
    user_id: userId,
    matched: result.verified,
    confidence: result.confidence,
    reason: parsed.reason.slice(0, 500),
  });
  return result;
}

/** True when the user has a successful verification within the validity window. */
export async function hasRecentVerification(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - IDENTITY_VALID_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("identity_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("matched", true)
    .gte("created_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}
