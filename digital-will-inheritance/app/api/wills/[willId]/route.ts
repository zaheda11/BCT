import { currentUser, jsonError, serverError } from "@/lib/auth";
import { authoritativeWill } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
export async function GET(_request:Request,context:{params:Promise<{willId:string}>}){
 try{
  const user=await currentUser();if(!user)return jsonError("Sign in first.",401);
  const {willId}=await context.params;
  const will=await prisma.will.findUnique({where:{id:willId},include:{versions:{orderBy:{version:"desc"}},assets:{include:{allocations:{include:{beneficiary:{select:{name:true,relationship:true,walletAddress:true}}}}}},beneficiaries:true,documents:{select:{id:true,filename:true,mimeType:true,sha256:true,claimId:true,version:true,claim:{select:{beneficiary:{select:{userId:true,walletAddress:true}}}},createdAt:true}},verifications:{orderBy:{createdAt:"desc"}},inheritance:true,claims:{include:{beneficiary:{select:{name:true,relationship:true,userId:true,walletAddress:true}},documents:{select:{id:true,filename:true,sha256:true}}}},transactions:{orderBy:{createdAt:"desc"}}}});
  if(!will)return jsonError("Will not found.",404);
  if(user.role==="TESTATOR"&&will.testatorId!==user.id)return jsonError("Will not found.",404);
  const chain=await authoritativeWill(willId);
  if(user.role==="BENEFICIARY"){
   const linked=!!user.walletAddress&&will.beneficiaries.some(b=>b.walletAddress.toLowerCase()===user.walletAddress!.toLowerCase());
   if(!linked||Number(chain.record.verification)!==2)return jsonError("Beneficiary access is not available for this will.",403);
  }else if(user.role==="VERIFIER"&&Number(chain.record.verification)!==1)return jsonError("No pending verification for this will.",403);
  else if(!["TESTATOR","VERIFIER","ADMIN"].includes(user.role))return jsonError("Role cannot access this will.",403);
  const claims=user.role==="VERIFIER"?[]:user.role==="BENEFICIARY"?will.claims.filter(c=>c.beneficiary.userId===user.id||c.beneficiary.walletAddress.toLowerCase()===user.walletAddress?.toLowerCase()):will.claims;
  const documents=user.role==="VERIFIER"?will.documents.filter(d=>d.claimId===null):user.role==="BENEFICIARY"?will.documents.filter(d=>!d.claim||d.claim.beneficiary.userId===user.id||d.claim.beneficiary.walletAddress.toLowerCase()===user.walletAddress?.toLowerCase()):will.documents;
  const publicDocuments=documents.map(document=>({id:document.id,filename:document.filename,mimeType:document.mimeType,sha256:document.sha256,claimId:document.claimId,version:document.version,createdAt:document.createdAt}));
  return Response.json({will:{...will,claims,documents:publicDocuments,status:["NONE","ACTIVE","REVOKED"][Number(chain.record.status)],version:Number(chain.record.version),documentHash:String(chain.record.documentHash),verificationStatus:["NONE","PENDING","APPROVED","REJECTED"][Number(chain.record.verification)],executed:Boolean(chain.record.executed)}});
 }catch(error){return serverError(error);}
}
