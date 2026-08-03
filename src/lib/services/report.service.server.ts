import { InterviewerAi } from "@/lib/ai/interviewer.server";
import { recommendationFor } from "@/lib/domain/scoring";
import type { AnswerAnalysisDto, ReportDto, ScoreBreakdown } from "@/lib/domain/types";
import {
  AnalysisRepository,
  ReportRepository,
  ScoreRepository,
} from "@/lib/repositories/analysis.repository.server";
import {
  AnswerRepository,
  InterviewRepository,
  QuestionRepository,
  RepositoryError,
  type Db,
} from "@/lib/repositories/interview.repository.server";
import { ProfileRepository } from "@/lib/repositories/profile.repository.server";
import { InterviewService } from "./interview.service.server";

export interface AdminInterviewSummary {
  interviewId: string;
  candidateName: string;
  candidateEmail: string;
  jobRole: string;
  seniority: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  overallScore: number | null;
  recommendation: string | null;
}

/**
 * Builds recruiter-facing reports: assembles every module's metrics per answer,
 * asks the LLM for a written summary, and caches the result in `reports`.
 */
export class ReportService {
  private readonly interviews: InterviewRepository;
  private readonly questions: QuestionRepository;
  private readonly answers: AnswerRepository;
  private readonly analysis: AnalysisRepository;
  private readonly scoreRepo: ScoreRepository;
  private readonly reports: ReportRepository;
  private readonly profiles: ProfileRepository;

  constructor(
    private readonly userDb: Db,
    private readonly adminDb: Db,
    private readonly ai: InterviewerAi = new InterviewerAi(),
  ) {
    this.interviews = new InterviewRepository(userDb);
    this.questions = new QuestionRepository(userDb);
    this.answers = new AnswerRepository(userDb);
    this.analysis = new AnalysisRepository(userDb);
    this.scoreRepo = new ScoreRepository(userDb);
    this.reports = new ReportRepository(adminDb);
    this.profiles = new ProfileRepository(userDb);
  }

  /** Returns the cached report, generating it on first request. */
  async getReport(interviewId: string): Promise<ReportDto> {
    const interview = await this.interviews.findById(interviewId);
    const [questions, answers, profile] = await Promise.all([
      this.questions.listByInterview(interviewId),
      this.answers.listByInterview(interviewId),
      this.profiles.findById(interview.candidate_id),
    ]);

    if (answers.length === 0) {
      throw new RepositoryError("This interview has no analysed answers yet", 400);
    }

    const loaded = await this.analysis.loadForAnswers(answers.map((a) => a.id));
    const byAnswer = <T extends { answer_id: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.answer_id, r]));
    const speechMap = byAnswer(loaded.speech);
    const faceMap = byAnswer(loaded.face);
    const emotionMap = byAnswer(loaded.emotion);
    const voiceMap = byAnswer(loaded.voice);
    const llmMap = byAnswer(loaded.llm);
    const questionText = new Map(questions.map((q) => [q.id, q.text]));

    const answerDtos: AnswerAnalysisDto[] = answers.map((a) => {
      const speech = speechMap.get(a.id);
      const face = faceMap.get(a.id);
      const emotion = emotionMap.get(a.id);
      const voice = voiceMap.get(a.id);
      const llm = llmMap.get(a.id);
      return {
        answerId: a.id,
        questionText: questionText.get(a.question_id) ?? "",
        transcript: speech?.transcript ?? "",
        durationSeconds: a.duration_seconds,
        speech: speech
          ? {
              transcript: speech.transcript,
              language: speech.language,
              confidence: speech.confidence,
              wordCount: speech.word_count,
              speechDurationSeconds: speech.speech_duration_seconds,
            }
          : null,
        face: face
          ? {
              faceDetectedRatio: face.face_detected_ratio,
              eyeContactRatio: face.eye_contact_ratio,
              headStability: face.head_stability,
              blinkRatePerMin: face.blink_rate_per_min,
              yawAvg: face.yaw_avg,
              pitchAvg: face.pitch_avg,
              landmarkSamples: face.landmark_samples,
            }
          : null,
        emotion: emotion
          ? {
              happy: emotion.happy,
              sad: emotion.sad,
              neutral: emotion.neutral,
              fear: emotion.fear,
              angry: emotion.angry,
              surprise: emotion.surprise,
              dominant: emotion.dominant_emotion,
            }
          : null,
        voice: voice
          ? {
              pitchHz: voice.pitch_hz,
              pitchVariance: voice.pitch_variance,
              energyRms: voice.energy_rms,
              volumeDb: voice.volume_db,
              speechRateWpm: voice.speech_rate_wpm,
              pauseCount: voice.pause_count,
              totalPauseSeconds: voice.total_pause_seconds,
              voiceConfidence: voice.voice_confidence,
            }
          : null,
        llm: llm
          ? {
              provider: llm.provider,
              model: llm.model,
              technicalScore: llm.technical_score,
              communicationScore: llm.communication_score,
              relevanceScore: llm.relevance_score,
              grammarScore: llm.grammar_score,
              evaluation: llm.evaluation ?? "",
              strengths: (llm.strengths ?? []) as string[],
              weaknesses: (llm.weaknesses ?? []) as string[],
              followUpQuestion: llm.follow_up_question,
            }
          : null,
      };
    });

    let scoreRow = await this.scoreRepo.findByInterview(interviewId);
    if (!scoreRow) {
      await new InterviewService(this.userDb, this.adminDb, this.ai).recomputeScores(interviewId);
      scoreRow = await this.scoreRepo.findByInterview(interviewId);
    }
    const scores: ScoreBreakdown = {
      overallScore: scoreRow?.overall_score ?? 0,
      technicalScore: scoreRow?.technical_score ?? 0,
      communicationScore: scoreRow?.communication_score ?? 0,
      confidenceScore: scoreRow?.confidence_score ?? 0,
      emotionScore: scoreRow?.emotion_score ?? 0,
      eyeContactScore: scoreRow?.eye_contact_score ?? 0,
      voiceScore: scoreRow?.voice_score ?? 0,
      grammarScore: scoreRow?.grammar_score ?? 0,
    };

    let report = await this.reports.findByInterview(interviewId);
    if (!report) {
      const written = await this.ai.summariseInterview({
        jobRole: interview.job_role,
        seniority: interview.seniority,
        perAnswer: answerDtos.map((a) => ({
          question: a.questionText,
          evaluation: a.llm?.evaluation ?? "",
          strengths: a.llm?.strengths ?? [],
          weaknesses: a.llm?.weaknesses ?? [],
        })),
        scoreSummary: scores as unknown as Record<string, number>,
      });
      const recommendation = recommendationFor(scores.overallScore);
      await this.reports.upsert({
        interviewId,
        summary: `${written.summary}\n\n${written.recommendationNote}`.trim(),
        recommendation,
        strengths: written.strengths,
        weaknesses: written.weaknesses,
        chartData: { scores, answerCount: answerDtos.length },
      });
      report = await this.reports.findByInterview(interviewId);
    }

    return {
      interviewId,
      jobRole: interview.job_role,
      seniority: interview.seniority,
      candidateName: profile?.full_name ?? "Candidate",
      candidateEmail: profile?.email ?? "",
      startedAt: interview.created_at,
      completedAt: interview.completed_at,
      summary: report?.summary ?? "",
      recommendation: report?.recommendation ?? recommendationFor(scores.overallScore),
      strengths: (report?.strengths ?? []) as string[],
      weaknesses: (report?.weaknesses ?? []) as string[],
      scores,
      answers: answerDtos,
    };
  }

  /** Admin overview across every candidate. */
  async listAllInterviews(): Promise<AdminInterviewSummary[]> {
    const interviews = await this.interviews.listAll();
    const [scores, profiles] = await Promise.all([
      this.scoreRepo.findByInterviews(interviews.map((i) => i.id)),
      this.profiles.findByIds([...new Set(interviews.map((i) => i.candidate_id))]),
    ]);
    const scoreByInterview = new Map(scores.map((s) => [s.interview_id, s]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    return interviews.map((i) => {
      const score = scoreByInterview.get(i.id);
      const profile = profileById.get(i.candidate_id);
      return {
        interviewId: i.id,
        candidateName: profile?.full_name ?? "Candidate",
        candidateEmail: profile?.email ?? "",
        jobRole: i.job_role,
        seniority: i.seniority,
        status: i.status,
        startedAt: i.created_at,
        completedAt: i.completed_at,
        overallScore: score?.overall_score ?? null,
        recommendation: score ? recommendationFor(score.overall_score) : null,
      };
    });
  }
}
