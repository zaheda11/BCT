import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ChainValidationError } from "@/lib/chain-id.js";
import type { User } from "@prisma/client";

const COOKIE = "dwi_session";
const SESSION_DAYS = 7;
const DUMMY_PASSWORD_HASH = (() => {
  const salt = Buffer.alloc(16, 0x42);
  return `${salt.toString("hex")}:${scryptSync("unavailable-password-check", salt, 64).toString("hex")}`;
})();
export type PublicUser = Pick<User, "id" | "name" | "email" | "role" | "walletAddress">;
export function safeUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, walletAddress: user.walletAddress };
}
export function passwordDigest(password: string) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${digest.toString("hex")}`;
}
export function checkPassword(password: string, stored: string) {
  const [saltHex, digestHex] = stored.split(":");
  if (!saltHex || !digestHex) return false;
  const expected = Buffer.from(digestHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function checkUnknownPassword(password: string) { checkPassword(password, DUMMY_PASSWORD_HASH); }
function tokenDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({ data: { tokenHash: tokenDigest(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: expiresAt });
}
export async function currentUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenDigest(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    jar.delete(COOKIE);
    return null;
  }
  return safeUser(session.user);
}
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenDigest(token) } });
  jar.delete(COOKIE);
}
export async function audit(actorId: string | null, actorRole: string, action: string, targetId?: string, details?: string) {
  await prisma.auditEvent.create({ data: { actorId, actorRole, action, targetId, details } });
}
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
export function serverError(error: unknown) {
  if (error instanceof ChainValidationError) return jsonError("Transaction could not be verified on the configured chain.", 409);
  const diagnostic = typeof error === "object" && error !== null ? error as { name?: unknown; code?: unknown } : null;
  console.error("API request failed", { name: typeof diagnostic?.name === "string" ? diagnostic.name : "unknown", code: typeof diagnostic?.code === "string" ? diagnostic.code : undefined });
  return jsonError("The request could not be completed.", 500);
}
