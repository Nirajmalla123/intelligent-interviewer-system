import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { InterviewStatus } from "@/lib/domain/types";

export type Db = SupabaseClient<Database>;
export type InterviewRow = Database["public"]["Tables"]["interviews"]["Row"];
export type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
export type AnswerRow = Database["public"]["Tables"]["answers"]["Row"];

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

function unwrap<T>(data: T | null, error: { message: string } | null, what: string): T {
  if (error) throw new RepositoryError(`${what}: ${error.message}`);
  if (data === null) throw new RepositoryError(`${what}: not found`, 404);
  return data;
}

/** Data access for interviews. Contains no business rules. */
export class InterviewRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    candidateId: string;
    jobRole: string;
    seniority: string;
    plannedQuestions: number;
  }): Promise<InterviewRow> {
    const { data, error } = await this.db
      .from("interviews")
      .insert({
        candidate_id: input.candidateId,
        job_role: input.jobRole,
        seniority: input.seniority,
        planned_questions: input.plannedQuestions,
      })
      .select()
      .single();
    return unwrap(data, error, "Create interview");
  }

  async findById(id: string): Promise<InterviewRow> {
    const { data, error } = await this.db.from("interviews").select().eq("id", id).maybeSingle();
    return unwrap(data, error, "Load interview");
  }

  async listByCandidate(candidateId: string, limit = 50): Promise<InterviewRow[]> {
    const { data, error } = await this.db
      .from("interviews")
      .select()
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return unwrap(data, error, "List interviews");
  }

  async listAll(limit = 200): Promise<InterviewRow[]> {
    const { data, error } = await this.db
      .from("interviews")
      .select()
      .order("created_at", { ascending: false })
      .limit(limit);
    return unwrap(data, error, "List all interviews");
  }

  async setStatus(id: string, status: InterviewStatus): Promise<InterviewRow> {
    const { data, error } = await this.db
      .from("interviews")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select()
      .single();
    return unwrap(data, error, "Update interview status");
  }
}

/** Data access for interview questions. */
export class QuestionRepository {
  constructor(private readonly db: Db) {}

  async createMany(
    rows: {
      interviewId: string;
      text: string;
      category: string;
      orderIndex: number;
      isFollowup?: boolean;
      parentQuestionId?: string | null;
    }[],
  ): Promise<QuestionRow[]> {
    const { data, error } = await this.db
      .from("questions")
      .insert(
        rows.map((r) => ({
          interview_id: r.interviewId,
          text: r.text,
          category: r.category,
          order_index: r.orderIndex,
          is_followup: r.isFollowup ?? false,
          parent_question_id: r.parentQuestionId ?? null,
        })),
      )
      .select();
    return unwrap(data, error, "Create questions");
  }

  async listByInterview(interviewId: string): Promise<QuestionRow[]> {
    const { data, error } = await this.db
      .from("questions")
      .select()
      .eq("interview_id", interviewId)
      .order("order_index", { ascending: true });
    return unwrap(data, error, "List questions");
  }

  async findById(id: string): Promise<QuestionRow> {
    const { data, error } = await this.db.from("questions").select().eq("id", id).maybeSingle();
    return unwrap(data, error, "Load question");
  }

  async maxOrderIndex(interviewId: string): Promise<number> {
    const { data, error } = await this.db
      .from("questions")
      .select("order_index")
      .eq("interview_id", interviewId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (error) throw new RepositoryError(`Read question order: ${error.message}`);
    return data?.[0]?.order_index ?? -1;
  }
}

/** Data access for candidate answers. */
export class AnswerRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    interviewId: string;
    questionId: string;
    candidateId: string;
    videoPath: string | null;
    durationSeconds: number;
  }): Promise<AnswerRow> {
    const { data, error } = await this.db
      .from("answers")
      .insert({
        interview_id: input.interviewId,
        question_id: input.questionId,
        candidate_id: input.candidateId,
        video_path: input.videoPath,
        duration_seconds: input.durationSeconds,
        analysis_status: "processing",
      })
      .select()
      .single();
    return unwrap(data, error, "Create answer");
  }

  async listByInterview(interviewId: string): Promise<AnswerRow[]> {
    const { data, error } = await this.db
      .from("answers")
      .select()
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });
    return unwrap(data, error, "List answers");
  }

  async markComplete(id: string): Promise<void> {
    const { error } = await this.db
      .from("answers")
      .update({ analysis_status: "complete", analysis_error: null })
      .eq("id", id);
    if (error) throw new RepositoryError(`Complete answer: ${error.message}`);
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.db
      .from("answers")
      .update({ analysis_status: "failed", analysis_error: message.slice(0, 500) })
      .eq("id", id);
  }
}
