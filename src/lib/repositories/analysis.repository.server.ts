import type {
  EmotionMetrics,
  FaceMetrics,
  LlmEvaluation,
  ScoreBreakdown,
  SpeechResult,
  VoiceMetrics,
} from "@/lib/domain/types";
import { RepositoryError, type Db } from "./interview.repository.server";
import type { Database } from "@/integrations/supabase/types";

export type SpeechRow = Database["public"]["Tables"]["speech_analysis"]["Row"];
export type FaceRow = Database["public"]["Tables"]["face_analysis"]["Row"];
export type EmotionRow = Database["public"]["Tables"]["emotion_analysis"]["Row"];
export type VoiceRow = Database["public"]["Tables"]["voice_analysis"]["Row"];
export type LlmRow = Database["public"]["Tables"]["llm_evaluations"]["Row"];
export type ScoreRow = Database["public"]["Tables"]["interview_scores"]["Row"];
export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];

/**
 * Persistence for each AI module's own table, plus aggregate scores and
 * reports. Writes require a service-role client (RLS makes these read-only
 * for end users), reads accept any client.
 */
export class AnalysisRepository {
  constructor(private readonly db: Db) {}

  async saveSpeech(answerId: string, result: SpeechResult): Promise<void> {
    const { error } = await this.db.from("speech_analysis").upsert(
      {
        answer_id: answerId,
        transcript: result.transcript,
        language: result.language,
        confidence: result.confidence,
        word_count: result.wordCount,
        speech_duration_seconds: result.speechDurationSeconds,
      },
      { onConflict: "answer_id" },
    );
    if (error) throw new RepositoryError(`Save speech analysis: ${error.message}`);
  }

  async saveFace(answerId: string, metrics: FaceMetrics): Promise<void> {
    const { error } = await this.db.from("face_analysis").upsert(
      {
        answer_id: answerId,
        face_detected_ratio: metrics.faceDetectedRatio,
        eye_contact_ratio: metrics.eyeContactRatio,
        head_stability: metrics.headStability,
        blink_rate_per_min: metrics.blinkRatePerMin,
        yaw_avg: metrics.yawAvg,
        pitch_avg: metrics.pitchAvg,
        landmark_samples: metrics.landmarkSamples,
      },
      { onConflict: "answer_id" },
    );
    if (error) throw new RepositoryError(`Save face analysis: ${error.message}`);
  }

  async saveEmotion(answerId: string, metrics: EmotionMetrics): Promise<void> {
    const { error } = await this.db.from("emotion_analysis").upsert(
      {
        answer_id: answerId,
        happy: metrics.happy,
        sad: metrics.sad,
        neutral: metrics.neutral,
        fear: metrics.fear,
        angry: metrics.angry,
        surprise: metrics.surprise,
        dominant_emotion: metrics.dominant,
      },
      { onConflict: "answer_id" },
    );
    if (error) throw new RepositoryError(`Save emotion analysis: ${error.message}`);
  }

  async saveVoice(answerId: string, metrics: VoiceMetrics): Promise<void> {
    const { error } = await this.db.from("voice_analysis").upsert(
      {
        answer_id: answerId,
        pitch_hz: metrics.pitchHz,
        pitch_variance: metrics.pitchVariance,
        energy_rms: metrics.energyRms,
        volume_db: metrics.volumeDb,
        speech_rate_wpm: metrics.speechRateWpm,
        pause_count: metrics.pauseCount,
        total_pause_seconds: metrics.totalPauseSeconds,
        voice_confidence: metrics.voiceConfidence,
      },
      { onConflict: "answer_id" },
    );
    if (error) throw new RepositoryError(`Save voice analysis: ${error.message}`);
  }

  async saveLlm(answerId: string, evaluation: LlmEvaluation): Promise<void> {
    const { error } = await this.db.from("llm_evaluations").upsert(
      {
        answer_id: answerId,
        provider: evaluation.provider,
        model: evaluation.model,
        technical_score: evaluation.technicalScore,
        communication_score: evaluation.communicationScore,
        relevance_score: evaluation.relevanceScore,
        grammar_score: evaluation.grammarScore,
        evaluation: evaluation.evaluation,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        follow_up_question: evaluation.followUpQuestion,
      },
      { onConflict: "answer_id" },
    );
    if (error) throw new RepositoryError(`Save LLM evaluation: ${error.message}`);
  }

  async loadForAnswers(answerIds: string[]): Promise<{
    speech: SpeechRow[];
    face: FaceRow[];
    emotion: EmotionRow[];
    voice: VoiceRow[];
    llm: LlmRow[];
  }> {
    if (answerIds.length === 0) {
      return { speech: [], face: [], emotion: [], voice: [], llm: [] };
    }
    const [speech, face, emotion, voice, llm] = await Promise.all([
      this.db.from("speech_analysis").select().in("answer_id", answerIds),
      this.db.from("face_analysis").select().in("answer_id", answerIds),
      this.db.from("emotion_analysis").select().in("answer_id", answerIds),
      this.db.from("voice_analysis").select().in("answer_id", answerIds),
      this.db.from("llm_evaluations").select().in("answer_id", answerIds),
    ]);
    const firstError = [speech, face, emotion, voice, llm].find((r) => r.error)?.error;
    if (firstError) throw new RepositoryError(`Load analysis: ${firstError.message}`);
    return {
      speech: speech.data ?? [],
      face: face.data ?? [],
      emotion: emotion.data ?? [],
      voice: voice.data ?? [],
      llm: llm.data ?? [],
    };
  }
}

/** Persistence for aggregate interview scores. */
export class ScoreRepository {
  constructor(private readonly db: Db) {}

  async upsert(interviewId: string, scores: ScoreBreakdown): Promise<void> {
    const { error } = await this.db.from("interview_scores").upsert(
      {
        interview_id: interviewId,
        overall_score: scores.overallScore,
        technical_score: scores.technicalScore,
        communication_score: scores.communicationScore,
        confidence_score: scores.confidenceScore,
        emotion_score: scores.emotionScore,
        eye_contact_score: scores.eyeContactScore,
        voice_score: scores.voiceScore,
        grammar_score: scores.grammarScore,
      },
      { onConflict: "interview_id" },
    );
    if (error) throw new RepositoryError(`Save interview scores: ${error.message}`);
  }

  async findByInterview(interviewId: string): Promise<ScoreRow | null> {
    const { data, error } = await this.db
      .from("interview_scores")
      .select()
      .eq("interview_id", interviewId)
      .maybeSingle();
    if (error) throw new RepositoryError(`Load scores: ${error.message}`);
    return data;
  }

  async findByInterviews(interviewIds: string[]): Promise<ScoreRow[]> {
    if (interviewIds.length === 0) return [];
    const { data, error } = await this.db
      .from("interview_scores")
      .select()
      .in("interview_id", interviewIds);
    if (error) throw new RepositoryError(`Load scores: ${error.message}`);
    return data ?? [];
  }
}

/** Persistence for generated recruiter reports. */
export class ReportRepository {
  constructor(private readonly db: Db) {}

  async upsert(input: {
    interviewId: string;
    summary: string;
    recommendation: string;
    strengths: string[];
    weaknesses: string[];
    chartData: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from("reports").upsert(
      {
        interview_id: input.interviewId,
        summary: input.summary,
        recommendation: input.recommendation,
        strengths: input.strengths,
        weaknesses: input.weaknesses,
        chart_data: input.chartData,
      },
      { onConflict: "interview_id" },
    );
    if (error) throw new RepositoryError(`Save report: ${error.message}`);
  }

  async findByInterview(interviewId: string): Promise<ReportRow | null> {
    const { data, error } = await this.db
      .from("reports")
      .select()
      .eq("interview_id", interviewId)
      .maybeSingle();
    if (error) throw new RepositoryError(`Load report: ${error.message}`);
    return data;
  }
}
