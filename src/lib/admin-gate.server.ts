import { useSession } from "@tanstack/react-start/server";

export type AdminSession = { admin?: boolean };

export function sessionConfig() {
  return {
    password: process.env["ADMIN_SESSION_SECRET"]!,
    name: "admin-gate",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

/** Server-only check used by admin data functions. */
export async function requireAdminGate() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (!session.data.admin) throw new Error("Admin login required");
}
