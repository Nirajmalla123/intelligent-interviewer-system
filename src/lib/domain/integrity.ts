export const MULTI_FACE_CONFIRM_MS = 2000;
export type SecurityEventKind = "multiple_faces" | "multiple_faces_cleared" | "terminated" | "identity_mismatch" | "identity_verified" | "identity_unavailable" | "sustained_gaze_away" | "possible_background_voice";
export interface SecurityEvent {
  eventKey: string;
  questionId: string | null;
  kind: SecurityEventKind;
  observedAt: string;
  details: string;
}
export interface IntegrityReview {
  suspicionScore: number | null;
  confidence: "low" | "medium";
  assessment: string;
  evidence: string[];
  limitations: string[];
  assessedAt: string;
}
export function normalizeIntegrityReview(raw: unknown): IntegrityReview {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const score = value["suspicion_score"];
  const strings = (key: string) => Array.isArray(value[key]) ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  return {
    suspicionScore: typeof score === "number" && Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : null,
    confidence: value["confidence"] === "medium" ? "medium" : "low",
    assessment: typeof value["assessment"] === "string" ? value["assessment"] : "Insufficient evidence for an integrity assessment.",
    evidence: strings("evidence"),
    limitations: [...strings("limitations"), "AI authorship cannot be reliably determined from a transcript. Gaze and audio observations are not proof of cheating; human review is required."],
    assessedAt: new Date().toISOString(),
  };
}
export function persistentMultipleFaces(start: number | null, now: number): boolean {
  return start !== null && now - start >= MULTI_FACE_CONFIRM_MS;
}