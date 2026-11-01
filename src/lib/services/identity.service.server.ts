import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** A verification is valid for this long before the interview must start. */
export const IDENTITY_VALID_MINUTES = 30;
const MIN_CONFIDENCE = 0.7;
const BUCKET = "avatars";
const referencePath = (userId: string) => `${userId}/face-reference.jpg`;

export interface IdentityResult {
  verified: boolean;
  confidence: number;
  reason: string;
}

interface VisionVerdict {
  live_face_count: number;
  reference_face_count: number;
  same_person: boolean;
  is_live_person: boolean;
  confidence: number;
  reason: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["live_face_count", "reference_face_count", "same_person", "is_live_person", "confidence", "reason"],
  properties: {
    live_face_count: { type: "integer" },
    reference_face_count: { type: "integer" },
    same_person: { type: "boolean" },
    is_live_person: { type: "boolean" },
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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function askVision(liveImage: string, referenceImage: string | null): Promise<VisionVerdict> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Identity verification is not configured");

  const content: unknown[] = [];
  if (referenceImage) {
    content.push({ type: "text", text: "Image 1: reference live capture taken at verification." });
    content.push({ type: "image_url", image_url: { url: referenceImage } });
    content.push({ type: "text", text: "Image 2: current live webcam capture." });
  } else {
    content.push({ type: "text", text: "Live webcam capture (no reference — set reference_face_count to 0 and same_person to true if exactly one real live face)." });
  }
  content.push({ type: "image_url", image_url: { url: liveImage } });

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
            "You are a face-verification system for interview security. Count clearly visible human faces in the live capture (live_face_count) and in the reference (reference_face_count). is_live_person is false if the live face is a photo of a screen, printed photo, or mask. When a reference is given, decide if both show the same person using stable facial features (face shape, eyes, nose, mouth, hairline), ignoring lighting, angle, glasses, or expression. If unsure, same_person=false. confidence is 0..1.",
        },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "face_verification", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiUnavailableError(
      response.status === 429
        ? "Verification is busy. Please retry in a moment."
        : response.status === 402
          ? gatewayErrorMessage(detail, "AI credits exhausted for this workspace.")
          : `Identity verification failed (${response.status})`,
    );
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "")) as VisionVerdict;
  } catch {
    throw new Error("Identity verification returned an unreadable result");
  }
}

function faceProblem(v: VisionVerdict): string | null {
  if (v.live_face_count === 0) return "No face was detected in the camera. Face the camera in good light.";
  if (v.live_face_count > 1) return "More than one face is visible. Only you should be in the frame.";
  if (!v.is_live_person) return "Please present your real face to the camera, not a photo or screen.";
  return null;
}

async function record(userId: string, result: IdentityResult, reason: string) {
  await supabaseAdmin.from("identity_verifications").insert({
    user_id: userId,
    matched: result.verified,
    confidence: result.confidence,
    reason: reason.slice(0, 500),
  });
}

/** The AI service could not be reached (no credits, rate limit, outage). */
class AiUnavailableError extends Error {}

/**
 * Pre-interview check: confirms one real live face is on camera and stores
 * that capture as the reference face for continuous checks during the interview.
 * If the AI service is unavailable, the on-device face count (exactly one face)
 * is used instead so the candidate can still register their live photo.
 */
export async function enrollIdentity(
  userId: string,
  liveImage: string,
  localFaceCount = -1,
): Promise<IdentityResult> {
  let result: IdentityResult;
  let reason: string;
  try {
    const verdict = await askVision(liveImage, null);
    const problem = faceProblem(verdict);
    result = problem
      ? { verified: false, confidence: 0, reason: problem }
      : { verified: true, confidence: verdict.confidence, reason: "Identity verified." };
    reason = verdict.reason;
  } catch (error) {
    if (!(error instanceof AiUnavailableError) || localFaceCount < 0) throw error;
    const problem = faceProblem({
      live_face_count: localFaceCount,
      reference_face_count: 0,
      same_person: true,
      is_live_person: true,
      confidence: 0,
      reason: "",
    });
    result = problem
      ? { verified: false, confidence: 0, reason: problem }
      : { verified: true, confidence: 0.5, reason: "Live photo saved and identity verified." };
    reason = `On-device check (AI unavailable: ${error.message})`;
  }
  if (result.verified) {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(referencePath(userId), dataUrlToBytes(liveImage), { upsert: true, contentType: "image/jpeg" });
    if (error) throw new Error("Could not save your face reference. Please retry.");
    // The live capture doubles as the candidate's profile picture.
    await supabaseAdmin.from("profiles").update({ avatar_url: referencePath(userId) }).eq("id", userId);
  }
  await record(userId, result, reason);
  return result;
}

/** True when the candidate has a stored live reference photo. */
export async function hasReference(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(userId, { search: "face-reference.jpg", limit: 1 });
  return (data ?? []).some((f) => f.name === "face-reference.jpg");
}

/** During the interview: compares the current webcam frame with the reference face. */
export async function compareWithReference(userId: string, liveImage: string): Promise<IdentityResult> {
  const { data: file, error } = await supabaseAdmin.storage.from(BUCKET).download(referencePath(userId));
  if (error || !file) {
    return { verified: false, confidence: 0, reason: "No face reference found. Please verify again." };
  }
  const refUrl = `data:image/jpeg;base64,${toBase64(new Uint8Array(await file.arrayBuffer()))}`;
  const verdict = await askVision(liveImage, refUrl);
  const problem = faceProblem(verdict);
  let result: IdentityResult;
  if (problem) result = { verified: false, confidence: 0, reason: problem };
  else {
    const ok = verdict.same_person && verdict.confidence >= MIN_CONFIDENCE;
    result = {
      verified: ok,
      confidence: verdict.confidence,
      reason: ok ? "Identity confirmed." : "The face on camera does not match the verified candidate.",
    };
  }
  await record(userId, result, verdict.reason);
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
