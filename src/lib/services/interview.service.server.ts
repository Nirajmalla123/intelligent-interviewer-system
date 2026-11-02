import { InterviewerAi } from "@/lib/ai/interviewer.server";
import { resolveSpeechProvider } from "@/lib/ai/speech-provider.server";
import { computeScores, recommendationFor } from "@/lib/domain/scoring";
import type {
  EmotionMetrics,
  FaceMetrics,
  LlmEvaluation,
  QuestionDto,
  SpeechResult,
  VoiceMetrics,
} from "@/lib/domain/types";
import { AnalysisRepository, ScoreRepository } from "@/lib/repositories/analysis.repository.server";
import {
  AnswerRepository,
  InterviewRepository,
  QuestionRepository,
  type Db,
} from "@/lib/repositories/interview.repository.server";
import {
  ProfileRepository,
  ResumeRepository,
} from "@/lib/repositories/profile.repository.server";
import { verifyResumeName } from "@/lib/domain/resume-verification";

const QUESTIONS_PER_INTERVIEW = 12;

export interface StartInterviewInput {
  candidateId: string;
  jobRole: string;
  seniority: string;
  questionCount?: number;
}

export interface StartInterviewResult {
  interviewId: string;
  questions: QuestionDto[];
}

export interface ProcessAnswerInput {
  candidateId: string;
  interviewId: string;
  questionId: string;
  audio: Blob;
  audioFileName: string;
  durationSeconds: number;
  videoPath: string | null;
  face: FaceMetrics;
  emotion: EmotionMetrics;
  voice: VoiceMetrics;
}

export interface ProcessAnswerResult {
  answerId: string;
  speech: SpeechResult;
  llm: LlmEvaluation;
  followUpQuestion: QuestionDto | null;
  interviewComplete: boolean;
}

const toQuestionDto = (row: {
  id: string;
  interview_id: string;
  order_index: number;
  text: string;
  category: string;
  is_followup: boolean;
}): QuestionDto => ({
  id: row.id,
  interviewId: row.interview_id,
  orderIndex: row.order_index,
  text: row.text,
  category: row.category,
  isFollowup: row.is_followup,
});

/**
 * Orchestrates an interview session: question planning, per-answer multimodal
 * analysis, adaptive follow-ups, and aggregate scoring. `userDb` is the
 * RLS-scoped client (ownership enforced by policies); `adminDb` writes the
 * AI-owned tables that are read-only for candidates.
 */
export class InterviewService {
  private readonly interviews: InterviewRepository;
  private readonly questions: QuestionRepository;
  private readonly answers: AnswerRepository;
  private readonly analysis: AnalysisRepository;
  private readonly scores: ScoreRepository;
  private readonly profiles: ProfileRepository;
  private readonly resumes: ResumeRepository;

  constructor(
    private readonly userDb: Db,
    private readonly adminDb: Db,
    private readonly ai: InterviewerAi = new InterviewerAi(),
  ) {
    this.interviews = new InterviewRepository(userDb);
    this.questions = new QuestionRepository(userDb);
    this.answers = new AnswerRepository(userDb);
    this.analysis = new AnalysisRepository(adminDb);
    this.scores = new ScoreRepository(adminDb);
    this.profiles = new ProfileRepository(userDb);
    this.resumes = new ResumeRepository(userDb);
  }

  async startInterview(input: StartInterviewInput): Promise<StartInterviewResult> {
    const [profile, resume] = await Promise.all([
      this.profiles.findById(input.candidateId),
      this.resumes.latestFor(input.candidateId),
    ]);

    const check = verifyResumeName(profile?.full_name, resume?.extracted_text);
    if (!check.verified) throw new Error(`Resume verification failed: ${check.reason}`);

    const planned = await this.ai.generateQuestionPlan({
      jobRole: input.jobRole,
      seniority: input.seniority,
      count: input.questionCount ?? QUESTIONS_PER_INTERVIEW,
      resumeText: resume?.extracted_text ?? null,
      candidateHeadline: profile?.headline ?? null,
      yearsExperience: profile?.years_experience ?? 0,
    });

    const interview = await this.interviews.create({
      candidateId: input.candidateId,
      jobRole: input.jobRole,
      seniority: input.seniority,
      plannedQuestions: planned.length,
    });

    const rows = await this.questions.createMany(
      planned.map((q, index) => ({
        interviewId: interview.id,
        text: q.text,
        category: q.category,
        orderIndex: index,
      })),
    );

    return {
      interviewId: interview.id,
      questions: rows.map(toQuestionDto).sort((a, b) => a.orderIndex - b.orderIndex),
    };
  }

  async getSession(interviewId: string): Promise<{
    interview: Awaited<ReturnType<InterviewRepository["findById"]>>;
    questions: QuestionDto[];
    answeredQuestionIds: string[];
  }> {
    const [interview, questions, answers] = await Promise.all([
      this.interviews.findById(interviewId),
      this.questions.listByInterview(interviewId),
      this.answers.listByInterview(interviewId),
    ]);
    return {
      interview,
      questions: questions.map(toQuestionDto),
      answeredQuestionIds: answers.map((a) => a.question_id),
    };
  }

  /**
   * Runs the full analysis pipeline for one answer. Speech-to-text must finish
   * before the LLM can judge content; the five persistence writes then run in
   * parallel, and aggregate scores are recomputed from every answer so far.
   */
  async processAnswer(input: ProcessAnswerInput): Promise<ProcessAnswerResult> {
    const [interview, question, priorAnswers, resume] = await Promise.all([
      this.interviews.findById(input.interviewId),
      this.questions.findById(input.questionId),
      this.answers.listByInterview(input.interviewId),
      this.resumes.latestFor(input.candidateId),
    ]);

    if (interview.status !== "in_progress") {
      throw new Error("This interview has ended and no longer accepts answers.");
    }
    const allQuestions = await this.questions.listByInterview(input.interviewId);
    const answeredCount = priorAnswers.length;
    const isLastQuestion = answeredCount + 1 >= allQuestions.length;

    const answer = await this.answers.create({
      interviewId: input.interviewId,
      questionId: input.questionId,
      candidateId: input.candidateId,
      videoPath: input.videoPath,
      durationSeconds: input.durationSeconds,
    });

    try {
      const speech = await resolveSpeechProvider().transcribe(
        input.audio,
        input.audioFileName,
        input.durationSeconds,
      );

      const history = await this.buildHistory(priorAnswers, allQuestions);

      const llm = await this.ai.evaluateAnswer({
        jobRole: interview.job_role,
        seniority: interview.seniority,
        questionText: question.text,
        transcript: speech.transcript,
        resumeText: resume?.extracted_text ?? null,
        history,
        face: input.face,
        emotion: input.emotion,
        voice: input.voice,
        isLastQuestion: isLastQuestion || question.is_followup,
        askedQuestions: allQuestions.map((item) => item.text),
      });

      await Promise.all([
        this.analysis.saveSpeech(answer.id, speech),
        this.analysis.saveFace(answer.id, input.face),
        this.analysis.saveEmotion(answer.id, input.emotion),
        this.analysis.saveVoice(answer.id, input.voice),
        this.analysis.saveLlm(answer.id, llm),
      ]);
      await this.answers.markComplete(answer.id);

      await this.recomputeScores(input.interviewId);

      let followUpQuestion: QuestionDto | null = null;
      if (llm.followUpQuestion && !isLastQuestion) {
        const nextIndex = (await this.questions.maxOrderIndex(input.interviewId)) + 1;
        const [row] = await this.questions.createMany([
          {
            interviewId: input.interviewId,
            text: llm.followUpQuestion,
            category: question.category,
            orderIndex: nextIndex,
            isFollowup: true,
            parentQuestionId: question.id,
          },
        ]);
        followUpQuestion = row ? toQuestionDto(row) : null;
      }

      return {
        answerId: answer.id,
        speech,
        llm,
        followUpQuestion,
        interviewComplete: isLastQuestion && followUpQuestion === null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed";
      await this.answers.markFailed(answer.id, message);
      throw error;
    }
  }

  async completeInterview(interviewId: string): Promise<void> {
    const interview = await this.interviews.findById(interviewId);
    if (interview.status === "abandoned") return;
    await this.recomputeScores(interviewId);
    await this.interviews.setStatus(interviewId, "completed");
  }

  private async buildHistory(
    priorAnswers: { id: string; question_id: string }[],
    questions: { id: string; text: string }[],
  ): Promise<{ question: string; transcript: string }[]> {
    if (priorAnswers.length === 0) return [];
    const loaded = await this.analysis.loadForAnswers(priorAnswers.map((a) => a.id));
    const transcriptByAnswer = new Map(loaded.speech.map((s) => [s.answer_id, s.transcript]));
    const textByQuestion = new Map(questions.map((q) => [q.id, q.text]));
    return priorAnswers.map((a) => ({
      question: textByQuestion.get(a.question_id) ?? "",
      transcript: transcriptByAnswer.get(a.id) ?? "",
    }));
  }

  /** Recomputes and persists aggregate scores from every analysed answer. */
  async recomputeScores(interviewId: string) {
    const answers = await this.answers.listByInterview(interviewId);
    const loaded = await this.analysis.loadForAnswers(answers.map((a) => a.id));

    const scores = computeScores({
      llm: loaded.llm.map((l) => ({
        provider: l.provider,
        model: l.model,
        technicalScore: l.technical_score,
        communicationScore: l.communication_score,
        relevanceScore: l.relevance_score,
        grammarScore: l.grammar_score,
        evaluation: l.evaluation ?? "",
        strengths: (l.strengths ?? []) as string[],
        weaknesses: (l.weaknesses ?? []) as string[],
        followUpQuestion: l.follow_up_question,
      })),
      face: loaded.face.map((f) => ({
        faceDetectedRatio: f.face_detected_ratio,
        eyeContactRatio: f.eye_contact_ratio,
        headStability: f.head_stability,
        blinkRatePerMin: f.blink_rate_per_min,
        yawAvg: f.yaw_avg,
        pitchAvg: f.pitch_avg,
        landmarkSamples: f.landmark_samples,
      })),
      emotion: loaded.emotion.map((e) => ({
        happy: e.happy,
        sad: e.sad,
        neutral: e.neutral,
        fear: e.fear,
        angry: e.angry,
        surprise: e.surprise,
        dominant: e.dominant_emotion,
      })),
      voice: loaded.voice.map((v) => ({
        pitchHz: v.pitch_hz,
        pitchVariance: v.pitch_variance,
        energyRms: v.energy_rms,
        volumeDb: v.volume_db,
        speechRateWpm: v.speech_rate_wpm,
        pauseCount: v.pause_count,
        totalPauseSeconds: v.total_pause_seconds,
        voiceConfidence: v.voice_confidence,
      })),
    });

    await this.scores.upsert(interviewId, scores);
    return { scores, recommendation: recommendationFor(scores.overallScore) };
  }
}
