import { randomUUID, createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { encryptDocument } from "@/lib/document-storage";
import { authoritativeWill } from "@/lib/chain";
import { validateDocument, validateFileBytes } from "@/lib/file-validation";
import { prisma } from "@/lib/prisma";
const storageDirectory = path.resolve(process.cwd(), "storage");
export async function GET(_request: Request, context: { params: Promise<{ willId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return jsonError("Sign in first.", 401);
    const { willId } = await context.params;
    const will = await prisma.will.findUnique({ where: { id: willId }, select: { id: true, testatorId: true } });
    if (!will) return jsonError("Will not found.", 404);
    let verifierQueueAccess = false;
    if (user.role === "VERIFIER") {
      const chain = await authoritativeWill(willId);
      verifierQueueAccess = Number(chain.record.status) === 1 && Number(chain.record.verification) === 1;
      if (!verifierQueueAccess) return jsonError("Verifier document access is limited to pending active wills.", 403);
    } else if (will.testatorId !== user.id && user.role !== "ADMIN") {
      if (user.role !== "BENEFICIARY" || !user.walletAddress || !await prisma.beneficiary.findFirst({ where: { willId, OR: [{ userId: user.id }, { walletAddress: user.walletAddress }, { walletAddress: user.walletAddress.toLowerCase() }] } })) return jsonError("You cannot view these documents.", 403);
      const chain = await authoritativeWill(willId);
      if (Number(chain.record.verification) !== 2) return jsonError("Beneficiary access opens after verification approval.", 403);
    }
    if (!["TESTATOR", "BENEFICIARY", "VERIFIER", "ADMIN"].includes(user.role)) return jsonError("Role cannot view documents.", 403);
    const documentWhere = verifierQueueAccess
      ? { willId, claimId: null }
      : user.role === "BENEFICIARY" && user.walletAddress
      ? { willId, OR: [{ claimId: null }, { claim: { beneficiary: { OR: [{ userId: user.id }, { walletAddress: user.walletAddress }, { walletAddress: user.walletAddress.toLowerCase() }] } } }] }
      : { willId };
    const documents = await prisma.document.findMany({ where: documentWhere, select: { id: true, filename: true, mimeType: true, sha256: true, version: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    return Response.json({ documents });
  } catch (error) { return serverError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ willId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return jsonError("Sign in first.", 401);
    const { willId } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Choose a document to upload.");
    const claimId = form.get("claimId");
    const requestedKind = form.get("kind");
    let claim: { id: string; beneficiary: { walletAddress: string } } | null = null;
    if (user.role === "TESTATOR") {
      const will = await prisma.will.findFirst({ where: { id: willId, testatorId: user.id } });
      if (!will) return jsonError("Will not found or not owned by this account.", 404);
    } else if (user.role === "BENEFICIARY" && user.walletAddress && typeof claimId === "string") {
      claim = await prisma.inheritanceClaim.findFirst({ where: { id: claimId, willId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, beneficiary: { OR: [{ userId: user.id }, { walletAddress: user.walletAddress }, { walletAddress: user.walletAddress.toLowerCase() }] } }, include: { beneficiary: { select: { walletAddress: true } } } });
      if (!claim) return jsonError("An open claim belonging to this beneficiary is required.", 403);
      const chain = await authoritativeWill(willId);
      if (Number(chain.record.verification) !== 2) return jsonError("Supporting claim documents are available after verifier approval.", 403);
    } else return jsonError("Only the testator or an authorized claimant can add documents.", 403);
    const will = await prisma.will.findUnique({ where: { id: willId }, select: { id: true } });
    if (!will) return jsonError("Will not found.", 404);
    let metadata: ReturnType<typeof validateDocument>; let bytes: Buffer;
    try { metadata = validateDocument(file); bytes = Buffer.from(await file.arrayBuffer()); validateFileBytes(bytes, metadata.mimeType); }
    catch (error) { return jsonError(error instanceof Error ? error.message : "Invalid document."); }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const currentVersion = await prisma.willVersion.findFirst({ where: { willId }, orderBy: { version: "desc" } });
    const kind = claim ? "CLAIM" : requestedKind === "SUPPORTING" ? "SUPPORTING" : "WILL";
    if (!currentVersion || (kind === "WILL" && currentVersion.documentHash.replace(/^0x/, "").toLowerCase() !== sha256.toLowerCase())) return jsonError("Will document does not match the current version fingerprint. Upload other evidence as a supporting document.", 409);
    let encrypted: ReturnType<typeof encryptDocument>;
    try { encrypted = encryptDocument(bytes); } catch (error) { return jsonError(error instanceof Error ? error.message : "Document encryption is not configured.", 503); }
    const storagePath = `${randomUUID()}.enc`; await mkdir(storageDirectory, { recursive: true });
    const absolute = path.join(storageDirectory, storagePath); await writeFile(absolute, encrypted.ciphertext, { flag: "wx" });
    try {
      const document = await prisma.document.create({ data: { willId, uploadedById: user.id, claimId: claim?.id ?? null, version: currentVersion.version, kind, filename: metadata.name, mimeType: metadata.mimeType, sha256, storagePath, nonce: encrypted.nonce, authTag: encrypted.authTag } });
      await audit(user.id, user.role, "DOCUMENT_UPLOADED", willId, `${document.id}:${sha256}`);
      return Response.json({ document: { id: document.id, filename: document.filename, mimeType: document.mimeType, sha256: document.sha256, createdAt: document.createdAt } }, { status: 201 });
    } catch (error) { await unlink(absolute).catch(() => undefined); throw error; }
  } catch (error) { return serverError(error); }
}
