/**
 * Shared domain contracts. Client-safe: imported by browser capture modules,
 * server services, and React components alike. No runtime dependencies.
 */

export type AnalysisStatus = "pending" | "processing" | "complete" | "failed";
export type InterviewStatus = "in_progress" | "completed" | "abandoned";
export type AppRole = "candidate" | "admin";
export type Seniority = "junior" | "mid" | "senior" | "lead";

/** Computer-vision metrics extracted per answer (face landmarks / head pose). */
export interface FaceMetrics {
  faceDetectedRatio: number;
  eyeContactRatio: number;
  headStability: number;
  blinkRatePerMin: number;
  yawAvg: number;
  pitchAvg: number;
  landmarkSamples: number;
}

/** Facial-expression distribution, values 0..1 summing to ~1. */
export interface EmotionMetrics {
  happy: number;
  sad: number;
  neutral: number;
  fear: number;
  angry: number;
  surprise: number;
  dominant: string;
}

/** Prosodic / acoustic metrics extracted from the answer audio. */
export interface VoiceMetrics {
  pitchHz: number;
  pitchVariance: number;
  energyRms: number;
  volumeDb: number;
  speechRateWpm: number;
  pauseCount: number;
  totalPauseSeconds: number;
  voiceConfidence: number;
}

export interface SpeechResult {
  transcript: string;
  language: string | null;
  confidence: number | null;
  wordCount: number;
  speechDurationSeconds: number | null;
}

export interface LlmEvaluation {
  provider: string;
  model: string;
  technicalScore: number;
  communicationScore: number;
  relevanceScore: number;
  grammarScore: number;
  evaluation: string;
  strengths: string[];
  weaknesses: string[];
  followUpQuestion: string | null;
}

export interface ScoreBreakdown {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
  emotionScore: number;
  eyeContactScore: number;
  voiceScore: number;
  grammarScore: number;
}

export interface QuestionDto {
  id: string;
  interviewId: string;
  orderIndex: number;
  text: string;
  category: string;
  isFollowup: boolean;
}

export interface AnswerAnalysisDto {
  answerId: string;
  questionText: string;
  transcript: string;
  durationSeconds: number;
  speech: SpeechResult | null;
  face: FaceMetrics | null;
  emotion: EmotionMetrics | null;
  voice: VoiceMetrics | null;
  llm: LlmEvaluation | null;
}

export interface ReportDto {
  interviewId: string;
  jobRole: string;
  seniority: string;
  candidateName: string;
  candidateEmail: string;
  completedAt: string | null;
  startedAt: string;
  summary: string;
  recommendation: string;
  strengths: string[];
  weaknesses: string[];
  scores: ScoreBreakdown;
  answers: AnswerAnalysisDto[];
}

export const JOB_ROLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full-Stack Engineer",
  "Data Scientist",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Mobile Engineer",
  "QA Engineer",
  "Product Manager",
  "Data Engineer",
] as const;

export const SENIORITY_LEVELS: { value: Seniority; label: string }[] = [
  { value: "junior", label: "Junior (0–2 yrs)" },
  { value: "mid", label: "Mid (2–5 yrs)" },
  { value: "senior", label: "Senior (5–8 yrs)" },
  { value: "lead", label: "Lead / Staff (8+ yrs)" },
];
