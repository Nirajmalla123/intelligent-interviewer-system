import { supabase } from "@/integrations/supabase/client";

/** Avatars live in a private bucket, so the browser needs a short-lived signed URL. */
export async function signedAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
