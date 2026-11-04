import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

import { isValidAdminToken, issueAdminToken } from "./admin-gate.server";

function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

export const getAdminGateStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { token?: string | null }) => ({ token: String(d?.token ?? "").slice(0, 200) }))
  .handler(async ({ data }) => ({ unlocked: isValidAdminToken(data.token) }));

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => ({
    username: String(d?.username ?? "").slice(0, 200),
    password: String(d?.password ?? "").slice(0, 200),
  }))
  .handler(async ({ data }) => {
    // Server-only credentials (this handler body never ships to the browser).
    const u = "admin";
    const p = "admin123!@#_";
    const ok =
      safeEqual(data.username.trim().toLowerCase(), u) && safeEqual(data.password.trim(), p);
    if (!ok) return { ok: false as const, token: null };
    return { ok: true as const, token: issueAdminToken() };
  });
