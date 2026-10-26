import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function PATCH(request:Request,context:{params:Promise<{claimId:string}>}){
 try{
  const user=await currentUser();if(!user)return jsonError("Sign in first.",401);
  if(user.role!=="ADMIN")return jsonError("Only an administrator can review claims.",403);
  const {claimId}=await context.params;const body=await request.json();
  if(!["UNDER_REVIEW","APPROVED","REJECTED"].includes(body.status))return jsonError("Claim status is invalid.");
  const claim=await prisma.inheritanceClaim.findUnique({where:{id:claimId}});if(!claim)return jsonError("Claim not found.",404);
  if(!["SUBMITTED","UNDER_REVIEW"].includes(claim.status))return jsonError("This claim has already been closed.",409);
  const updated=await prisma.inheritanceClaim.update({where:{id:claimId},data:{status:body.status,reviewedAt:["APPROVED","REJECTED"].includes(body.status)?new Date():null}});
  await audit(user.id,user.role,"CLAIM_"+body.status,claim.willId,claim.id);
  return Response.json({claim:updated});
 }catch(error){return serverError(error);}
}
