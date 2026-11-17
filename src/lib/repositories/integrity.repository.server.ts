import type { Db } from "./interview.repository.server";
import { RepositoryError } from "./interview.repository.server";
import type { IntegrityReview, SecurityEvent } from "@/lib/domain/integrity";

export class IntegrityRepository {
  constructor(private readonly db: Db) {}
  async saveReview(answerId: string, interviewId: string, review: IntegrityReview) {
    const { error } = await this.db.from("answer_integrity_reviews").upsert({ answer_id: answerId, interview_id: interviewId, review: JSON.parse(JSON.stringify(review)) });
    if (error) throw new RepositoryError(error.message);
  }
  async events(interviewId: string): Promise<SecurityEvent[]> {
    const { data, error } = await this.db.from("interview_security_events").select().eq("interview_id", interviewId).order("observed_at");
    if (error) throw new RepositoryError(error.message);
    return (data ?? []).map((row) => ({ eventKey: row.event_key, questionId: row.question_id, kind: row.kind as SecurityEvent["kind"], observedAt: row.observed_at, details: row.details }));
  }
  async reviews(interviewId: string): Promise<Map<string, IntegrityReview>> {
    const { data, error } = await this.db.from("answer_integrity_reviews").select().eq("interview_id", interviewId);
    if (error) throw new RepositoryError(error.message);
    return new Map((data ?? []).map((row) => [row.answer_id, row.review as unknown as IntegrityReview]));
  }
}