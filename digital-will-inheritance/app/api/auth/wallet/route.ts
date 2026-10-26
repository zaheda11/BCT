import { verifyMessage } from "ethers";
import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return jsonError("Sign in first.", 401);
    const body = await request.json();
    if (typeof body.message !== "string" || typeof body.signature !== "string") return jsonError("A challenge message and wallet signature are required.");
    const challenge = await prisma.walletChallenge.findFirst({ where: { userId: user.id, message: body.message, consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!challenge) return jsonError("Wallet link challenge expired or already used.", 400);
    let address: string;
    try { address = verifyMessage(challenge.message, body.signature); } catch { return jsonError("Wallet signature is invalid.", 400); }
    const claimed = await prisma.walletChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) return jsonError("Wallet link challenge already used.", 409);
    try {
      await prisma.user.update({ where: { id: user.id }, data: { walletAddress: address } });
    } catch { return jsonError("That wallet address is already linked to another account.", 409); }
    await audit(user.id, user.role, "WALLET_LINKED", user.id, address.toLowerCase());
    return Response.json({ walletAddress: address });
  } catch (error) { return serverError(error); }
}
