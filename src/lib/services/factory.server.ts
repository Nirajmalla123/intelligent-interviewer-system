import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Db } from "@/lib/repositories/interview.repository.server";
import { InterviewService } from "./interview.service.server";
import { ReportService } from "./report.service.server";

/**
 * Builds services with the RLS-scoped user client plus the admin client used
 * for AI-owned tables. Server-only: never imported from client code.
 */
export function makeInterviewService(userDb: Db): InterviewService {
  return new InterviewService(userDb, supabaseAdmin as unknown as Db);
}

export function makeReportService(userDb: Db): ReportService {
  return new ReportService(userDb, supabaseAdmin as unknown as Db);
}

export { supabaseAdmin };
