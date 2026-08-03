import type {
  EmotionMetrics,
  FaceMetrics,
  LlmEvaluation,
  ScoreBreakdown,
  VoiceMetrics,
} from "./types";

/**
 * Pure scoring math. Isolated from persistence and AI providers so it can be
 * unit-tested and reused on both client (live preview) and server (final score).
 */

const clamp = (value: number, min = 0, max = 100): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

export interface ScoreInputs {
  llm: LlmEvaluation[];
  face: FaceMetrics[];
  emotion: EmotionMetrics[];
  voice: VoiceMetrics[];
}

/** Composure derived from expression mix: calm/positive affect scores higher. */
export function emotionScoreOf(emotions: EmotionMetrics[]): number {
  if (emotions.length === 0) return 0;
  return clamp(
    mean(
      emotions.map((e) => {
        const positive = e.happy * 1 + e.neutral * 0.9 + e.surprise * 0.5;
        const negative = e.fear * 0.9 + e.sad * 0.7 + e.angry * 0.8;
        return (positive - negative + 1) * 50;
      }),
    ),
  );
}

export function eyeContactScoreOf(faces: FaceMetrics[]): number {
  if (faces.length === 0) return 0;
  return clamp(
    mean(
      faces.map((f) => {
        const presence = clamp(f.faceDetectedRatio * 100);
        const gaze = clamp(f.eyeContactRatio * 100);
        const stability = clamp(f.headStability * 100);
        return gaze * 0.65 + presence * 0.2 + stability * 0.15;
      }),
    ),
  );
}

export function voiceScoreOf(voices: VoiceMetrics[]): number {
  if (voices.length === 0) return 0;
  return clamp(
    mean(
      voices.map((v) => {
        const confidence = clamp(v.voiceConfidence * 100);
        // Ideal delivery pace sits around 130 wpm; penalise drift either way.
        const pace = clamp(100 - Math.abs(v.speechRateWpm - 130) * 0.7);
        const energy = clamp(v.energyRms * 900);
        return confidence * 0.5 + pace * 0.3 + energy * 0.2;
      }),
    ),
  );
}

export function computeScores(inputs: ScoreInputs): ScoreBreakdown {
  const technicalScore = clamp(mean(inputs.llm.map((l) => l.technicalScore)));
  const communicationScore = clamp(mean(inputs.llm.map((l) => l.communicationScore)));
  const grammarScore = clamp(mean(inputs.llm.map((l) => l.grammarScore)));
  const eyeContactScore = eyeContactScoreOf(inputs.face);
  const emotionScore = emotionScoreOf(inputs.emotion);
  const voiceScore = voiceScoreOf(inputs.voice);

  const confidenceScore = clamp(
    voiceScore * 0.4 + eyeContactScore * 0.35 + emotionScore * 0.25,
  );

  const overallScore = clamp(
    technicalScore * 0.34 +
      communicationScore * 0.22 +
      confidenceScore * 0.16 +
      eyeContactScore * 0.1 +
      voiceScore * 0.1 +
      grammarScore * 0.05 +
      emotionScore * 0.03,
  );

  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    overallScore: round(overallScore),
    technicalScore: round(technicalScore),
    communicationScore: round(communicationScore),
    confidenceScore: round(confidenceScore),
    emotionScore: round(emotionScore),
    eyeContactScore: round(eyeContactScore),
    voiceScore: round(voiceScore),
    grammarScore: round(grammarScore),
  };
}

export function recommendationFor(overall: number): string {
  if (overall >= 80) return "Strong Hire";
  if (overall >= 68) return "Hire";
  if (overall >= 55) return "Borderline — second interview";
  if (overall >= 40) return "Weak — do not advance";
  return "No Hire";
}

export function scoreTone(score: number): "success" | "primary" | "warning" | "destructive" {
  if (score >= 75) return "success";
  if (score >= 60) return "primary";
  if (score >= 45) return "warning";
  return "destructive";
}
