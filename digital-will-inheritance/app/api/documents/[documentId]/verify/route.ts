import { currentUser, jsonError, serverError } from "@/lib/auth";
import { authoritativeWill } from "@/lib/chain";
import { verifyFileHash, validateDocument, validateFileBytes } from "@/lib/file-validation";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return jsonError("Sign in first.", 401);
    const { documentId } = await context.params;
    const document = await prisma.document.findUnique({ where: { id: documentId }, include: { will: { select: { id: true, testatorId: true, beneficiaries: { select: { userId: true, walletAddress: true } } } }, claim: { include: { beneficiary: { select: { userId: true, walletAddress: true } } } } } });
    if (!document) return jsonError("Document not found.", 404);
    if (document.will.testatorId !== user.id && user.role !== "ADMIN") {
      const wallet=user.walletAddress?.toLowerCase();
      const linked=!!wallet&&document.will.beneficiaries.some(b=>b.userId===user.id||b.walletAddress.toLowerCase()===wallet);
      const claimLinked=!document.claim||(document.claim.beneficiary.userId===user.id||document.claim.beneficiary.walletAddress.toLowerCase()===wallet);
      if(user.role!=="BENEFICIARY"||!linked||!claimLinked)return jsonError("You cannot verify this document.",403);
      const chain=await authoritativeWill(document.will.id);if(Number(chain.record.verification)!==2)return jsonError("Beneficiary access opens after verifier approval.",403);
    }
    const file = (await request.formData()).get("file"); if (!(file instanceof File)) return jsonError("Choose the file to verify.");
    let metadata: ReturnType<typeof validateDocument>; let bytes: Buffer;
    try {
      metadata = validateDocument(file);
      if (metadata.mimeType !== document.mimeType) return Response.json({ matches: false, error: "File type differs from the registered document." });
      bytes = Buffer.from(await file.arrayBuffer()); validateFileBytes(bytes, metadata.mimeType);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Invalid document.");
    }
    const result = verifyFileHash(bytes, document.sha256);
    return Response.json({ ...result, expected: document.sha256, documentId });
  } catch (error) { return serverError(error); }
}
