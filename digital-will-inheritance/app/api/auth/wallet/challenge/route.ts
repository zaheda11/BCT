import { randomBytes } from "node:crypto";
import { currentUser, jsonError, serverError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return jsonError("Sign in first.", 401);
    const nonce = randomBytes(32).toString("hex");
    const message = `Digital Will demo wallet link\nNonce: ${nonce}\nUser: ${user.id}`;
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await prisma.walletChallenge.create({ data: { userId: user.id, nonce, message, expiresAt } });
    return Response.json({ message, expiresAt });
  } catch (error) { return serverError(error); }
}
