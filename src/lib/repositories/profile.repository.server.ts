import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/domain/types";
import { RepositoryError, type Db } from "./interview.repository.server";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];

/** Data access for candidate profiles, resumes and roles. */
export class ProfileRepository {
  constructor(private readonly db: Db) {}

  async findById(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await this.db.from("profiles").select().eq("id", userId).maybeSingle();
    if (error) throw new RepositoryError(`Load profile: ${error.message}`);
    return data;
  }

  async findByIds(userIds: string[]): Promise<ProfileRow[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await this.db.from("profiles").select().in("id", userIds);
    if (error) throw new RepositoryError(`Load profiles: ${error.message}`);
    return data ?? [];
  }

  async listAll(limit = 500): Promise<ProfileRow[]> {
    const { data, error } = await this.db
      .from("profiles")
      .select()
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new RepositoryError(`List profiles: ${error.message}`);
    return data ?? [];
  }

  async upsert(
    userId: string,
    input: {
      email: string | null;
      fullName: string;
      phone: string | null;
      headline: string | null;
      targetRole: string | null;
      yearsExperience: number;
      location: string | null;
      avatarUrl?: string | null;
    },
  ): Promise<ProfileRow> {
    const { data, error } = await this.db
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: input.email,
          full_name: input.fullName,
          phone: input.phone,
          headline: input.headline,
          target_role: input.targetRole,
          years_experience: input.yearsExperience,
          location: input.location,
        },
        { onConflict: "id" },
      )
      .select()
      .single();
    if (error || !data) throw new RepositoryError(`Save profile: ${error?.message ?? "no row"}`);
    return data;
  }

  async rolesOf(userId: string): Promise<AppRole[]> {
    const { data, error } = await this.db.from("user_roles").select("role").eq("user_id", userId);
    if (error) throw new RepositoryError(`Load roles: ${error.message}`);
    return (data ?? []).map((r) => r.role as AppRole);
  }
}

/** Data access for uploaded resumes. */
export class ResumeRepository {
  constructor(private readonly db: Db) {}

  async latestFor(userId: string): Promise<ResumeRow | null> {
    const { data, error } = await this.db
      .from("resumes")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new RepositoryError(`Load resume: ${error.message}`);
    return data?.[0] ?? null;
  }

  async create(input: {
    userId: string;
    filePath: string;
    fileName: string;
    extractedText: string | null;
  }): Promise<ResumeRow> {
    const { data, error } = await this.db
      .from("resumes")
      .insert({
        user_id: input.userId,
        file_path: input.filePath,
        file_name: input.fileName,
        extracted_text: input.extractedText,
      })
      .select()
      .single();
    if (error || !data) throw new RepositoryError(`Save resume: ${error?.message ?? "no row"}`);
    return data;
  }

  async deleteAllFor(userId: string): Promise<void> {
    const { error } = await this.db.from("resumes").delete().eq("user_id", userId);
    if (error) throw new RepositoryError(`Delete resume: ${error.message}`);
  }
}
