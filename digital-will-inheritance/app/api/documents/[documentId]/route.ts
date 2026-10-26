import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser, jsonError, serverError } from "@/lib/auth";
import { decryptDocument } from "@/lib/document-storage";
import { createHash } from "node:crypto";
import { authoritativeWill } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return jsonError("Sign in first.", 401);
    const { documentId } = await context.params;
    const document = await prisma.document.findUnique({ where: { id: documentId }, include: { will: { select: { id: true, testatorId: true, beneficiaries: { select: { userId: true, walletAddress: true } } } }, claim: { include: { beneficiary: { select: { userId: true, walletAddress: true } } } } } });
    if (!document) return jsonError("Document not found.", 404);
    if (user.role === "ADMIN") {
      // Administrators may retrieve records for support and audit.
    } else if (document.will.testatorId === user.id && user.role === "TESTATOR") {
      // The owning testator may retrieve documents for their will.
    } else if (user.role === "VERIFIER") {
      const chain = await authoritativeWill(document.willId);
      if (document.claimId || Number(chain.record.status) !== 1 || Number(chain.record.verification) !== 1) return jsonError("Verifier access is limited to non-claim documents for pending active wills.", 403);
    } else if (user.role === "BENEFICIARY") {
      const wallet=user.walletAddress?.toLowerCase();
      const linked=!!wallet&&document.will.beneficiaries.some(b=>b.userId===user.id||b.walletAddress.toLowerCase()===wallet);
      const claimLinked=!document.claim||(document.claim.beneficiary.userId===user.id||document.claim.beneficiary.walletAddress.toLowerCase()===wallet);
      if (!linked || !claimLinked) return jsonError("You cannot download this document.", 403);
      const chain = await authoritativeWill(document.willId);
      if (Number(chain.record.verification) !== 2) return jsonError("Beneficiary access opens after verification approval.", 403);
    } else return jsonError("You cannot download this document.", 403);
    if (path.basename(document.storagePath) !== document.storagePath || !document.storagePath.endsWith(".enc")) return jsonError("Document storage reference is invalid.", 500);
    const ciphertext = await readFile(path.join(process.cwd(), "storage", document.storagePath));
    const plain = decryptDocument(ciphertext, document.nonce, document.authTag);
    if (createHash("sha256").update(plain).digest("hex") !== document.sha256) return jsonError("Stored document hash does not match its metadata.", 500);
    return new Response(plain, { headers: { "Content-Type": document.mimeType, "Content-Length": String(plain.length), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return serverError(error); }
}
