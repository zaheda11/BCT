import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { validTxHash, verifyVerifierRoleTransaction } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
export async function PATCH(request:Request,context:{params:Promise<{userId:string}>}){
 try{
  const actor=await currentUser();if(!actor)return jsonError("Sign in first.",401);
  if(actor.role!=="ADMIN"||!actor.walletAddress)return jsonError("A linked administrator wallet is required.",403);
  const {userId}=await context.params;const target=await prisma.user.findUnique({where:{id:userId}});if(!target)return jsonError("User not found.",404);
  if(!target.walletAddress||!["TESTATOR","BENEFICIARY","VERIFIER"].includes(target.role))return jsonError("Target account must have a linked wallet and a non-administrator role.",409);
  const body=await request.json();if(!["GRANT","REVOKE"].includes(body.action)||!validTxHash(body.txHash))return jsonError("Provide a valid role action and confirmed transaction hash.");
  const grant=body.action==="GRANT";
  if(grant&&target.role==="VERIFIER")return jsonError("This user is already an authorized verifier.",409);
  if(!grant&&target.role!=="VERIFIER")return jsonError("This user is not currently an application verifier.",409);
  const {tx}=await verifyVerifierRoleTransaction({txHash:body.txHash,actorAddress:actor.walletAddress,targetAddress:target.walletAddress,grant});
  const updated=await prisma.user.update({where:{id:target.id},data:grant?{roleBeforeVerifier:target.role,role:"VERIFIER"}:{role:target.roleBeforeVerifier||"TESTATOR",roleBeforeVerifier:null}});
  await audit(actor.id,actor.role,grant?"VERIFIER_ROLE_GRANTED":"VERIFIER_ROLE_REVOKED",target.id,tx.hash);
  return Response.json({user:{id:updated.id,name:updated.name,email:updated.email,role:updated.role,walletAddress:updated.walletAddress},txHash:tx.hash});
 }catch(error){return serverError(error);}
}
