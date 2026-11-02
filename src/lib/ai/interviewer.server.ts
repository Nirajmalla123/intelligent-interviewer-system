import { resolveLlmProvider, type LlmProvider } from "./llm-provider.server";
import { generateLocalQuestionPlan, generateLocalFollowUp } from "@/lib/domain/question-bank";
import type {
  EmotionMetrics,
  FaceMetrics,
  LlmEvaluation,
  VoiceMetrics,
} from "@/lib/domain/types";

/**
 * AI interviewer "brain": generates the question plan, evaluates answers and
 * produces follow-up questions. Depends only on the LlmProvider abstraction.
 */

const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "technical_score",
    "communication_score",
    "relevance_score",
    "grammar_score",
    "evaluation",
    "strengths",
    "weaknesses",
  ],
  properties: {
    technical_score: { type: "number" },
    communication_score: { type: "number" },
    relevance_score: { type: "number" },
    grammar_score: { type: "number" },
    evaluation: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
  },
} as const;

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "weaknesses", "recommendation_note"],
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    recommendation_note: { type: "string" },
  },
} as const;

export interface QuestionPlanRequest {
  jobRole: string;
  seniority: string;
  count: number;
  resumeText: string | null;
  candidateHeadline: string | null;
  yearsExperience: number;
}

export interface PlannedQuestion {
  text: string;
  category: string;
}

export interface EvaluationRequest {
  jobRole: string;
  seniority: string;
  questionText: string;
  transcript: string;
  resumeText: string | null;
  history: { question: string; transcript: string }[];
  face: FaceMetrics;
  emotion: EmotionMetrics;
  voice: VoiceMetrics;
  isLastQuestion: boolean;
  askedQuestions?: string[];
}

export interface SummaryRequest {
  jobRole: string;
  seniority: string;
  perAnswer: { question: string; evaluation: string; strengths: string[]; weaknesses: string[] }[];
  scoreSummary: Record<string, number>;
}

export interface SummaryResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendationNote: string;
}

const clampScore = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 6)
    : [];

export class InterviewerAi {
  constructor(private configuredProvider?: LlmProvider) {}

  private get provider(): LlmProvider {
    this.configuredProvider ??= resolveLlmProvider();
    return this.configuredProvider;
  }

  get providerName(): string {
    return this.provider.name;
  }

  get modelName(): string {
    return this.provider.model;
  }

  async generateQuestionPlan(request: QuestionPlanRequest): Promise<PlannedQuestion[]> {
    return generateLocalQuestionPlan(request);
  }

  async evaluateAnswer(request: EvaluationRequest): Promise<LlmEvaluation> {
    const raw = await this.provider.completeJson<Record<string, unknown>>({
      schemaName: "answer_evaluation",
      schema: EVALUATION_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "You are an expert interview assessor. Score the transcript of a spoken answer. " +
            "Scores are 0-100 integers. Judge technical correctness and depth, communication " +
            "structure and clarity, relevance to the question, and spoken grammar. " +
            "Non-verbal signals are provided as context only — never score technical content " +
            "from them. If the transcript is empty or off-topic, score low and say why. " +
            "Evaluate only the answer; follow-up questions are selected separately.",
        },
        {
          role: "user",
          content: [
            `Role: ${request.jobRole} (${request.seniority})`,
            `Question asked: ${request.questionText}`,
            `Candidate transcript: ${request.transcript || "(silence — no speech detected)"}`,
            request.resumeText ? `Resume excerpt: ${request.resumeText.slice(0, 2000)}` : "",
            request.history.length > 0
              ? `Earlier in this interview:\n${request.history
                  .map((h, i) => `${i + 1}. Q: ${h.question}\n   A: ${h.transcript.slice(0, 600)}`)
                  .join("\n")}`
              : "",
            `Non-verbal context: eye contact ${(request.face.eyeContactRatio * 100).toFixed(0)}%, ` +
              `dominant expression ${request.emotion.dominant}, ` +
              `speech rate ${request.voice.speechRateWpm.toFixed(0)} wpm, ` +
              `${request.voice.pauseCount} pauses.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    return {
      provider: this.provider.name,
      model: this.provider.model,
      technicalScore: clampScore(raw["technical_score"]),
      communicationScore: clampScore(raw["communication_score"]),
      relevanceScore: clampScore(raw["relevance_score"]),
      grammarScore: clampScore(raw["grammar_score"]),
      evaluation: typeof raw["evaluation"] === "string" ? raw["evaluation"] : "",
      strengths: toStringArray(raw["strengths"]),
      weaknesses: toStringArray(raw["weaknesses"]),
      followUpQuestion: generateLocalFollowUp(request),
    };
  }

  async summariseInterview(request: SummaryRequest): Promise<SummaryResult> {
    const raw = await this.provider.completeJson<Record<string, unknown>>({
      schemaName: "interview_summary",
      schema: SUMMARY_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "You write concise recruiter-facing interview summaries. Be specific and evidence-based, " +
            "referencing what the candidate actually said. Two short paragraphs maximum.",
        },
        {
          role: "user",
          content: [
            `Role: ${request.jobRole} (${request.seniority})`,
            `Computed scores: ${JSON.stringify(request.scoreSummary)}`,
            "Per-answer assessments:",
            ...request.perAnswer.map(
              (a, i) =>
                `${i + 1}. Q: ${a.question}\n   Assessment: ${a.evaluation}\n   + ${a.strengths.join("; ")}\n   - ${a.weaknesses.join("; ")}`,
            ),
          ].join("\n"),
        },
      ],
    });

    return {
      summary: typeof raw["summary"] === "string" ? raw["summary"] : "",
      strengths: toStringArray(raw["strengths"]),
      weaknesses: toStringArray(raw["weaknesses"]),
      recommendationNote:
        typeof raw["recommendation_note"] === "string" ? raw["recommendation_note"] : "",
    };
  }
}
