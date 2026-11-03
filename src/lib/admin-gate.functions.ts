import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

import { sessionConfig, type AdminSession } from "./admin-gate.server";

function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

export const getAdminGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return { unlocked: !!session.data.admin };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => ({
    username: String(d?.username ?? "").slice(0, 200),
    password: String(d?.password ?? "").slice(0, 200),
  }))
  .handler(async ({ data }) => {
    const u = process.env["ADMIN_USERNAME"];
    const p = process.env["ADMIN_PASSWORD"];
    if (!u || !p) throw new Error("Admin login is not configured");
    const ok = safeEqual(data.username, u) && safeEqual(data.password, p);
    if (!ok) return { ok: false as const };
    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ admin: true });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});
