import { createHmac, timingSafeEqual } from "node:crypto";

// Admin access uses a signed, expiring token held by the browser tab instead of a
// cookie: the preview runs inside a cross-site iframe where cookies are dropped.
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;

function secret() {
  const s = process.env["ADMIN_SESSION_SECRET"];
  if (!s) throw new Error("Admin access is not configured");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload, "utf8").digest("hex");
}

export function issueAdminToken() {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${sign(`admin:${exp}`)}`;
}

export function isValidAdminToken(token: unknown): boolean {
  if (typeof token !== "string" || token.length > 200) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(`admin:${exp}`), "hex");
  const given = Buffer.from(mac, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Server-only check used by admin data functions. */
export function requireAdminGate(token: unknown) {
  if (!isValidAdminToken(token)) throw new Error("Admin login required");
}
