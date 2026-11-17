import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmotionMetrics, FaceMetrics, VoiceMetrics } from "@/lib/domain/types";
import type { Db } from "@/lib/repositories/interview.repository.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const startSchema = z.object({
  jobRole: z.string().min(2).max(120),
  seniority: z.enum(["junior", "mid", "senior", "lead"]),
  questionCount: z.union([z.literal(12), z.literal(15), z.literal(20)]).default(12),
});

const idSchema = z.object({ interviewId: z.string().uuid() });

const securityEventSchema = z.object({
  eventKey: z.string().uuid(), questionId: z.string().uuid().nullable(),
  kind: z.enum(["multiple_faces", "multiple_faces_cleared", "terminated", "identity_mismatch", "identity_verified", "identity_unavailable", "sustained_gaze_away", "possible_background_voice"]),
  observedAt: z.string().datetime(), details: z.string().max(500),
});
export const recordSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: z.string().uuid(), events: z.array(securityEventSchema).max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: interview, error } = await context.supabase.from("interviews").select("id,candidate_id").eq("id", data.interviewId).single();
    if (error || interview?.candidate_id !== context.userId) throw new Error("Interview access denied");
    const questionIds = data.events.map((event) => event.questionId).filter((id): id is string => id !== null);
    if (questionIds.length) {
      const { data: questions, error: questionError } = await context.supabase.from("questions").select("id").eq("interview_id", data.interviewId).in("id", questionIds);
      if (questionError || questionIds.some((id) => !questions?.some((q) => q.id === id))) throw new Error("Invalid interview question");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: writeError } = await supabaseAdmin.from("interview_security_events").upsert(data.events.map((event) => ({
      event_key: event.eventKey, interview_id: data.interviewId, question_id: event.questionId,
      kind: event.kind, observed_at: event.observedAt, details: event.details,
    })), { onConflict: "event_key", ignoreDuplicates: true });
    if (writeError) throw new Error(writeError.message);
    return { ok: true };
  });

const faceSchema = z.object({
  faceDetectedRatio: z.number(),
  eyeContactRatio: z.number(),
  headStability: z.number(),
  blinkRatePerMin: z.number(),
  yawAvg: z.number(),
  pitchAvg: z.number(),
  landmarkSamples: z.number(),
});

const emotionSchema = z.object({
  happy: z.number(),
  sad: z.number(),
  neutral: z.number(),
  fear: z.number(),
  angry: z.number(),
  surprise: z.number(),
  dominant: z.string(),
});

const voiceSchema = z.object({
  pitchHz: z.number(),
  pitchVariance: z.number(),
  energyRms: z.number(),
  volumeDb: z.number(),
  speechRateWpm: z.number(),
  pauseCount: z.number(),
  totalPauseSeconds: z.number(),
  voiceConfidence: z.number(),
});

export const startInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { hasRecentVerification } = await import("./services/identity.service.server");
    if (!(await hasRecentVerification(context.userId))) {
      throw new Error("Identity not verified. Complete the face verification before starting.");
    }
    const { makeInterviewService } = await import("./services/factory.server");
    return makeInterviewService(context.supabase as unknown as Db).startInterview({
      candidateId: context.userId,
      jobRole: data.jobRole,
      seniority: data.seniority,
      questionCount: data.questionCount,
    });
  });

export const getInterviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { makeInterviewService } = await import("./services/factory.server");
    const session = await makeInterviewService(
      context.supabase as unknown as Db,
    ).getSession(data.interviewId);
    return {
      jobRole: session.interview.job_role,
      seniority: session.interview.seniority,
      status: session.interview.status,
      questions: session.questions,
      answeredQuestionIds: session.answeredQuestionIds,
    };
  });

/**
 * Receives one recorded answer: the media blob plus the browser-computed
 * vision/voice metrics. FormData is used because a Blob cannot cross the
 * ordinary server-function JSON boundary.
 */
export const processAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected multipart form data");
    const media = input.get("media");
    if (!(media instanceof File)) throw new Error("Missing answer recording");
    const json = <T,>(key: string, schema: z.ZodType<T>): T =>
      schema.parse(JSON.parse(String(input.get(key) ?? "{}")));
    return {
      interviewId: z.string().uuid().parse(input.get("interviewId")),
      questionId: z.string().uuid().parse(input.get("questionId")),
      durationSeconds: Number(input.get("durationSeconds") ?? 0),
      videoPath: input.get("videoPath") ? String(input.get("videoPath")) : null,
      media,
      face: json<FaceMetrics>("face", faceSchema),
      emotion: json<EmotionMetrics>("emotion", emotionSchema),
      voice: json<VoiceMetrics>("voice", voiceSchema),
    };
  })
  .handler(async ({ data, context }) => {
    const { makeInterviewService } = await import("./services/factory.server");
    const result = await makeInterviewService(context.supabase as unknown as Db).processAnswer({
      candidateId: context.userId,
      interviewId: data.interviewId,
      questionId: data.questionId,
      audio: data.media,
      audioFileName: data.media.name || "answer.webm",
      durationSeconds: data.durationSeconds,
      videoPath: data.videoPath,
      face: data.face,
      emotion: data.emotion,
      voice: data.voice,
    });
    return {
      answerId: result.answerId,
      transcript: result.speech.transcript,
      evaluation: result.llm.evaluation,
      strengths: result.llm.strengths,
      weaknesses: result.llm.weaknesses,
      followUpQuestion: result.followUpQuestion,
      interviewComplete: result.interviewComplete,
    };
  });

export const completeInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { makeInterviewService } = await import("./services/factory.server");
    await makeInterviewService(context.supabase as unknown as Db).completeInterview(
      data.interviewId,
    );
    return { ok: true };
  });

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { makeReportService } = await import("./services/factory.server");
    return makeReportService(context.supabase as unknown as Db).getReport(data.interviewId);
  });

export const listMyInterviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ InterviewRepository }, { ScoreRepository }] = await Promise.all([
      import("./repositories/interview.repository.server"),
      import("./repositories/analysis.repository.server"),
    ]);
    const db = context.supabase as unknown as Db;
    const interviews = await new InterviewRepository(db).listByCandidate(context.userId);
    const scores = await new ScoreRepository(db).findByInterviews(interviews.map((i) => i.id));
    const scoreByInterview = new Map(scores.map((s) => [s.interview_id, s]));
    return interviews.map((i) => ({
      id: i.id,
      jobRole: i.job_role,
      seniority: i.seniority,
      status: i.status,
      createdAt: i.created_at,
      completedAt: i.completed_at,
      overallScore: scoreByInterview.get(i.id)?.overall_score ?? null,
    }));
  });

export const getMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ ProfileRepository, ResumeRepository }] = await Promise.all([
      import("./repositories/profile.repository.server"),
    ]);
    const db = context.supabase as unknown as Db;
    const profiles = new ProfileRepository(db);
    const [profile, roles, resume] = await Promise.all([
      profiles.findById(context.userId),
      profiles.rolesOf(context.userId),
      new ResumeRepository(db).latestFor(context.userId),
    ]);
    return {
      profile: profile
        ? {
            email: profile.email,
            fullName: profile.full_name,
            phone: profile.phone,
            headline: profile.headline,
            targetRole: profile.target_role,
            yearsExperience: profile.years_experience,
            location: profile.location,
          }
        : null,
      roles,
      isAdmin: roles.includes("admin"),
      resumeText: resume?.extracted_text ?? null,
      resumeFileName: resume?.file_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    };
  });

const profileSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().max(40).nullable(),
  headline: z.string().max(200).nullable(),
  targetRole: z.string().max(120).nullable(),
  yearsExperience: z.number().min(0).max(60),
  location: z.string().max(120).nullable(),
  resumeText: z.string().max(20000).nullable(),
  resumeFileName: z.string().max(200).nullable().optional(),
  resumePath: z.string().max(300).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
});

export const saveMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { ProfileRepository, ResumeRepository } = await import(
      "./repositories/profile.repository.server"
    );
    const db = context.supabase as unknown as Db;
    const email = (context.claims['email'] as string | undefined) ?? null;
    await new ProfileRepository(db).upsert(context.userId, {
      email,
      fullName: data.fullName,
      phone: data.phone,
      headline: data.headline,
      targetRole: data.targetRole,
      yearsExperience: data.yearsExperience,
      location: data.location,
      ...(data.avatarUrl === undefined ? {} : { avatarUrl: data.avatarUrl }),
    });
    if (data.resumeText !== null) {
      const resumes = new ResumeRepository(db);
      await resumes.deleteAllFor(context.userId);
      if (data.resumeText.trim().length > 0) {
        await resumes.create({
          userId: context.userId,
          filePath: data.resumePath ?? `${context.userId}/pasted.txt`,
          fileName: data.resumeFileName ?? "pasted-resume.txt",
          extractedText: data.resumeText.trim(),
        });
      }
    }

    return { ok: true };
  });

const adminTokenSchema = z.object({ token: z.string().max(200).optional() }).optional();

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminTokenSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    void context;
    const { requireAdminGate } = await import("./admin-gate.server");
    requireAdminGate(data?.token);
    const { makeReportService } = await import("./services/factory.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return makeReportService(supabaseAdmin as unknown as Db).adminOverview();
  });

export const listAllInterviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminTokenSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    void context;
    const { requireAdminGate } = await import("./admin-gate.server");
    requireAdminGate(data?.token);
    const { makeReportService } = await import("./services/factory.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return makeReportService(supabaseAdmin as unknown as Db).listAllInterviews();
  });

const identitySchema = z.object({
  image: z
    .string()
    .max(3_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,/),
  localFaceCount: z.number().int().min(-1).max(10).optional(),
});

/** Pre-interview live face capture; becomes the reference face. */
export const verifyMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => identitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { enrollIdentity } = await import("./services/identity.service.server");
    return enrollIdentity(context.userId, data.image, data.localFaceCount ?? -1);
  });

/** Continuous in-interview check against the reference face. */
export const checkMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => identitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { compareWithReference } = await import("./services/identity.service.server");
    return compareWithReference(context.userId, data.image, data.localFaceCount ?? -1);
  });

export const getMyIdentityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasRecentVerification, hasReference } = await import(
      "./services/identity.service.server"
    );
    const [verified, reference] = await Promise.all([
      hasRecentVerification(context.userId),
      hasReference(context.userId),
    ]);
    return { verified, hasReference: reference };
  });

/** Ends an interview for a security violation; it can no longer be continued. */
export const terminateInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ interviewId: z.string().uuid(), reason: z.string().max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("interviews")
      .update({ status: "abandoned" })
      .eq("id", data.interviewId)
      .eq("candidate_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
