import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { authoritativeWill, validTxHash, verifyTransaction } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
const actions = { WILL_REVOKED: "WillRevoked", VERIFICATION_SUBMITTED: "VerificationSubmitted", VERIFICATION_DECIDED: "VerificationDecided", INHERITANCE_EXECUTED: "InheritanceExecuted" } as const;
type Action = keyof typeof actions;
export async function POST(request: Request, context: { params: Promise<{ willId: string }> }) {
 try {
  const user=await currentUser(); if(!user)return jsonError("Sign in first.",401);
  const {willId}=await context.params; const body=await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.action !== "string" || !Object.hasOwn(actions, body.action) || !validTxHash(body.txHash)) return jsonError("Workflow event or transaction hash is invalid.");
  const action=body.action as Action; const contractEvent=actions[action];
  const will=await prisma.will.findUnique({where:{id:willId}});
  if(!will)return jsonError("Will not found in the application database.",404);
  if(action==="WILL_REVOKED"&&(user.role!=="TESTATOR"||will.testatorId!==user.id))return jsonError("Only this will’s testator can record revocation.",403);
  if(action!=="WILL_REVOKED"&&(user.role!=="VERIFIER"||!user.walletAddress))return jsonError("A linked verifier account is required.",403);
  if(!user.walletAddress)return jsonError("Link the transaction wallet to this account first.",403);
  const approved=action==="VERIFICATION_DECIDED"?body.approved:undefined;
  if(action==="VERIFICATION_SUBMITTED"&&typeof body.referenceHash!=="string")return jsonError("Verification reference hash is required.");
  const {tx}=await verifyTransaction({txHash:body.txHash,willId,action:contractEvent,actorAddress:user.walletAddress,referenceHash:action==="VERIFICATION_SUBMITTED"||action==="VERIFICATION_DECIDED"?body.referenceHash:undefined,approved});
  const chain=await authoritativeWill(willId); const verificationStatus=["NONE","PENDING","APPROVED","REJECTED"][Number(chain.record.verification)];
  if(action==="WILL_REVOKED"&&Number(chain.record.status)!==2)return jsonError("Contract does not report a revoked will.",409);
  if(action==="VERIFICATION_SUBMITTED"&&(verificationStatus!=="PENDING"||String(chain.record.verificationRef).toLowerCase()!==String(body.referenceHash).toLowerCase()))return jsonError("Confirmed contract verification state does not match this request.",409);
  if(action==="VERIFICATION_DECIDED"&&verificationStatus!==(approved?"APPROVED":"REJECTED"))return jsonError("Contract verification decision does not match this request.",409);
  if(action==="INHERITANCE_EXECUTED"&&(!chain.record.executed||Number(chain.record.verification)!==2||Number(chain.record.status)!==1))return jsonError("Contract does not report eligible completed inheritance.",409);
  const prior=await prisma.blockchainTransaction.findUnique({where:{txHash:tx.hash}});
  if(prior)return Response.json({ok:true,idempotent:true});
  await prisma.$transaction(async(db)=>{
    await db.blockchainTransaction.create({data:{willId,action,status:"CONFIRMED",txHash:tx.hash}});
    if(action==="WILL_REVOKED")await db.will.update({where:{id:willId},data:{status:"REVOKED"}});
    if(action==="VERIFICATION_SUBMITTED")await db.deathVerification.create({data:{willId,referenceHash:String(body.referenceHash),status:"PENDING",txHash:tx.hash}});
    if(action==="VERIFICATION_DECIDED"){
      const pending=await db.deathVerification.findFirst({where:{willId,status:"PENDING"},orderBy:{createdAt:"desc"}});
      if(!pending)throw new Error("No matching pending verification is recorded in the database.");
      await db.deathVerification.update({where:{id:pending.id},data:{status:approved?"APPROVED":"REJECTED",txHash:tx.hash}});
    }
    if(action==="INHERITANCE_EXECUTED")await db.inheritance.upsert({where:{willId},create:{willId,status:"PROCESSED",txHash:tx.hash},update:{status:"PROCESSED",txHash:tx.hash}});
  });
  await audit(user.id,user.role,action,willId,tx.hash);
  return Response.json({ok:true,txHash:tx.hash});
 }catch(error){return serverError(error);}
}
