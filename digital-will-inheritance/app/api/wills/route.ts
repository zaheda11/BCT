import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { authoritativeWill, validBytes32, validTxHash, verifyTransaction } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type BeneficiaryInput = { name: string; relationship: string; walletAddress: string; allocationBps: number };
type AssetInput = { category: string; description: string; declaredValue?: string; ownershipReference?: string; allocations?: { walletAddress: string; allocationBps: number }[] };
function allocationTotal(rows: { allocationBps: number }[]) { return rows.length > 0 && rows.every((row) => Number.isInteger(row.allocationBps) && row.allocationBps > 0) && rows.reduce((sum, row) => sum + row.allocationBps, 0) === 10000; }
function chainStatus(value: number) { return ["NONE", "ACTIVE", "REVOKED"][value] ?? "UNKNOWN"; }
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return jsonError("Sign in first.", 401);
    let where: Prisma.WillWhereInput;
    if (user.role === "ADMIN") where = {};
    else if (user.role === "VERIFIER") where = { status: "ACTIVE" };
    else if (user.role === "BENEFICIARY") where = { beneficiaries: { some: { OR: [{ userId: user.id }, ...(user.walletAddress ? [{ walletAddress: user.walletAddress }, { walletAddress: user.walletAddress.toLowerCase() }] : [])] } }, verifications: { some: { status: "APPROVED" } } };
    else if (user.role === "TESTATOR") where = { testatorId: user.id };
    else return jsonError("This account role cannot view wills.", 403);
    const wills = await prisma.will.findMany({ where, include: { versions: { orderBy: { version: "desc" } }, assets: { include: { allocations: true } }, beneficiaries: true, documents: { select: { id: true, filename: true, mimeType: true, sha256: true, claimId: true, version: true, createdAt: true, claim: { select: { beneficiary: { select: { userId: true, walletAddress: true } } } } } }, verifications: { orderBy: { createdAt: "desc" } }, inheritance: true, claims: { include: { beneficiary: { select: { userId: true, walletAddress: true } } } }, transactions: { orderBy: { createdAt: "desc" } } }, orderBy: { updatedAt: "desc" } });
    const authoritative = await Promise.all(wills.map(async (will) => {
      const chain = await authoritativeWill(will.id);
      const addresses = chain.beneficiaries[0] as readonly string[];
      const shares = chain.beneficiaries[1] as readonly bigint[];
      const beneficiaries = will.beneficiaries.map((b) => {
        const index = addresses.findIndex((address) => address.toLowerCase() === b.walletAddress.toLowerCase());
        if (index < 0) throw new Error("Database beneficiaries do not match contract state.");
        return { ...b, allocationBps: Number(shares[index]) };
      });
      if (user.role === "VERIFIER" && Number(chain.record.verification) !== 1) return null;
      const visibleClaims = user.role === "VERIFIER" ? [] : user.role === "BENEFICIARY" ? will.claims.filter((claim) => claim.beneficiary.userId === user.id || (!!user.walletAddress && claim.beneficiary.walletAddress.toLowerCase() === user.walletAddress.toLowerCase())) : will.claims;
      const visibleDocuments = user.role === "VERIFIER"
        ? will.documents.filter((doc) => doc.claimId === null)
        : user.role === "BENEFICIARY"
          ? will.documents.filter((doc) => !doc.claim || doc.claim.beneficiary.userId === user.id || (!!user.walletAddress && doc.claim.beneficiary.walletAddress.toLowerCase() === user.walletAddress.toLowerCase()))
          : will.documents;
      const publicDocuments = visibleDocuments.map((document) => ({ id: document.id, filename: document.filename, mimeType: document.mimeType, sha256: document.sha256, claimId: document.claimId, version: document.version, createdAt: document.createdAt }));
      return { ...will, claims: visibleClaims, documents: publicDocuments, status: chainStatus(Number(chain.record.status)), version: Number(chain.record.version), documentHash: String(chain.record.documentHash), verificationStatus: ["NONE", "PENDING", "APPROVED", "REJECTED"][Number(chain.record.verification)], executed: Boolean(chain.record.executed), beneficiaries };
    }));
    return Response.json({ wills: authoritative.filter((will) => will !== null) });
  } catch (error) { return serverError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return jsonError("Sign in first.", 401);
    if (user.role !== "TESTATOR" || !user.walletAddress) return jsonError("A linked testator wallet is required.", 403);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Request body must be a JSON object.");
    const willId = body.willId;
    const txHash = body.txHash;
    const documentHash = body.documentHash;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const version = Number(body.version);
    if (!Array.isArray(body.beneficiaries) || !Array.isArray(body.assets)) return jsonError("Beneficiaries and assets must be arrays.");
    const beneficiaries = body.beneficiaries as BeneficiaryInput[];
    const assets = body.assets as AssetInput[];
    if (!validBytes32(willId) || !validTxHash(txHash) || !validBytes32(documentHash)) return jsonError("A valid will ID, confirmed transaction hash, and document hash are required.");
    if (!title || title.length > 120 || !Number.isInteger(version) || version < 1) return jsonError("Will title or version is invalid.");
    if (beneficiaries.some((b) => !b || typeof b !== "object") || !allocationTotal(beneficiaries.map((b) => ({ allocationBps: Number(b.allocationBps) })))) return jsonError("Beneficiary allocations must total exactly 10,000 basis points.");
    const wallets = new Set<string>();
    for (const b of beneficiaries) {
      if (typeof b.name !== "string" || b.name.trim().length < 1 || b.name.length > 100 || typeof b.relationship !== "string" || b.relationship.length > 80 || !/^0x[0-9a-fA-F]{40}$/.test(b.walletAddress)) return jsonError("A beneficiary field is invalid.");
      const key = b.walletAddress.toLowerCase();
      if (wallets.has(key)) return jsonError("Beneficiary wallet addresses must be unique.");
      wallets.add(key);
    }
    for (const asset of assets) {
      if (!asset || typeof asset !== "object" || typeof asset.category !== "string" || asset.category.length > 80 || typeof asset.description !== "string" || !asset.description.trim() || asset.description.length > 500) return jsonError("An asset field is invalid.");
      if ((asset.declaredValue !== undefined && typeof asset.declaredValue !== "string") || (asset.ownershipReference !== undefined && typeof asset.ownershipReference !== "string")) return jsonError("Asset value and ownership reference must be text.");
      if (asset.allocations !== undefined && !Array.isArray(asset.allocations)) return jsonError("Asset allocations must be an array.");
      if (asset.allocations) {
        const allocationWallets = new Set<string>();
        const invalidAddress = asset.allocations.some((a) => {
          if (!a || typeof a.walletAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a.walletAddress)) return true;
          const key = a.walletAddress.toLowerCase();
          if (allocationWallets.has(key)) return true;
          allocationWallets.add(key);
          return !wallets.has(key);
        });
        if (invalidAddress || !allocationTotal(asset.allocations)) return jsonError("Each asset allocation must use unique will beneficiaries and total 100%.");
      }
    }
    const action = version === 1 ? "WillCreated" : "WillUpdated";
    const { tx } = await verifyTransaction({ txHash, willId, action, actorAddress: user.walletAddress, documentHash, version });
    const chain = await authoritativeWill(willId);
    if (String(chain.record.testator).toLowerCase() !== user.walletAddress.toLowerCase() || String(chain.record.documentHash).toLowerCase() !== documentHash.toLowerCase() || Number(chain.record.version) !== version || Number(chain.record.status) !== 1) return jsonError("Confirmed contract state does not match this submitted will.", 409);
    const chainAddresses = chain.beneficiaries[0] as readonly string[];
    const chainShares = chain.beneficiaries[1] as readonly bigint[];
    const chainBeneficiaries: Array<[string, number]> = chainAddresses.map((address, i) => [address.toLowerCase(), Number(chainShares[i])]);
    const requestedBeneficiaries: Array<[string, number]> = beneficiaries.map((b) => [b.walletAddress.toLowerCase(), Number(b.allocationBps)]);
    if (chainBeneficiaries.length !== requestedBeneficiaries.length || chainBeneficiaries.some(([address, share]) => !requestedBeneficiaries.some(([candidate, candidateShare]) => candidate === address && candidateShare === share))) return jsonError("Database beneficiary details do not match the confirmed contract state.", 409);
    const existing = await prisma.will.findUnique({ where: { id: willId }, include: { beneficiaries: true } });
    if (existing && existing.testatorId !== user.id) return jsonError("Will belongs to another account.", 403);
    const prior = await prisma.blockchainTransaction.findUnique({ where: { txHash } });
    if (prior) {
      if (prior.willId !== willId || prior.action !== (version === 1 ? "WILL_CREATED" : "WILL_UPDATED") || !existing || existing.testatorId !== user.id) return jsonError("Transaction is already recorded for a different operation.", 409);
      return Response.json({ will: await prisma.will.findUnique({ where: { id: willId }, include: { versions: true, beneficiaries: true, assets: true } }), idempotent: true });
    }
    if ((version === 1 && existing) || (version > 1 && (!existing || existing.testatorId !== user.id || (await prisma.willVersion.findUnique({ where: { willId_version: { willId, version: version - 1 } } })) === null))) return jsonError("Will version is not the next expected version.", 409);
    const will = await prisma.$transaction(async (db) => {
      const saved = existing
        ? await db.will.update({ where: { id: willId }, data: { title, status: "ACTIVE" } })
        : await db.will.create({ data: { id: willId, testatorId: user.id, title } });
      await db.willVersion.create({ data: { willId, version, documentHash, txHash } });
      for (const b of beneficiaries) {
        const row = await db.beneficiary.upsert({ where: { willId_walletAddress: { willId, walletAddress: b.walletAddress.toLowerCase() } }, create: { willId, name: b.name.trim(), relationship: b.relationship.trim(), walletAddress: b.walletAddress.toLowerCase(), allocationBps: Number(b.allocationBps) }, update: { name: b.name.trim(), relationship: b.relationship.trim(), allocationBps: Number(b.allocationBps) } });
        if (version > 1 && row.userId) await db.beneficiary.update({ where: { id: row.id }, data: { allocationBps: Number(b.allocationBps) } });
      }
      if (version > 1) {
        const retained = beneficiaries.map((b) => b.walletAddress.toLowerCase());
        await db.beneficiary.deleteMany({ where: { willId, walletAddress: { notIn: retained }, claims: { none: {} } } });
      }
      for (const asset of assets) {
        const savedAsset = await db.asset.create({ data: { willId, version, category: asset.category.trim(), description: asset.description.trim(), declaredValue: asset.declaredValue?.slice(0, 80), ownershipReference: asset.ownershipReference?.slice(0, 250) } });
        if (asset.allocations?.length) {
          for (const allocation of asset.allocations) {
            const beneficiary = await db.beneficiary.findUniqueOrThrow({ where: { willId_walletAddress: { willId, walletAddress: allocation.walletAddress.toLowerCase() } } });
            await db.assetAllocation.create({ data: { assetId: savedAsset.id, beneficiaryId: beneficiary.id, allocationBps: Number(allocation.allocationBps) } });
          }
        }
      }
      await db.blockchainTransaction.create({ data: { willId, action: version === 1 ? "WILL_CREATED" : "WILL_UPDATED", txHash: tx.hash, status: "CONFIRMED" } });
      return saved;
    });
    await audit(user.id, user.role, action.toUpperCase(), willId, tx.hash);
    return Response.json({ will }, { status: version === 1 ? 201 : 200 });
  } catch (error) { return serverError(error); }
}
