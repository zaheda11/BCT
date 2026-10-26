import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { authoritativeWill } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
export async function GET(_request: Request, context: { params: Promise<{ willId: string }> }) {
 try {
  const user=await currentUser(); if(!user)return jsonError("Sign in first.",401);
  const {willId}=await context.params;
  const will=await prisma.will.findUnique({where:{id:willId},include:{beneficiaries:true}}); if(!will)return jsonError("Will not found.",404);
  const chain=await authoritativeWill(willId);
  if(user.role==="BENEFICIARY"&&(!user.walletAddress||Number(chain.record.verification)<2||!will.beneficiaries.some(b=>b.walletAddress.toLowerCase()===user.walletAddress!.toLowerCase())))return jsonError("Claim information is not authorized yet.",403);
  if(user.role==="TESTATOR"&&will.testatorId!==user.id)return jsonError("You cannot access this will.",403);
  if(!["BENEFICIARY","TESTATOR","ADMIN"].includes(user.role))return jsonError("Role cannot view claims.",403);
  const claims=await prisma.inheritanceClaim.findMany({where:{willId,...(user.role==="BENEFICIARY"?{beneficiary:{OR:[{userId:user.id},{walletAddress:user.walletAddress!.toLowerCase()}]}}:{})},include:{beneficiary:{select:{name:true,relationship:true,walletAddress:true}},documents:{select:{id:true,filename:true,sha256:true,createdAt:true}}},orderBy:{createdAt:"desc"}});
  return Response.json({claims});
 }catch(error){return serverError(error);}
}
export async function POST(request:Request,context:{params:Promise<{willId:string}>}){
 try{
  const user=await currentUser();if(!user)return jsonError("Sign in first.",401);
  if(user.role!=="BENEFICIARY"||!user.walletAddress)return jsonError("A linked beneficiary account is required.",403);
  const {willId}=await context.params;const will=await prisma.will.findUnique({where:{id:willId},include:{beneficiaries:true}});if(!will)return jsonError("Will not found.",404);
  const chain=await authoritativeWill(willId);if(Number(chain.record.status)!==1||Number(chain.record.verification)<2)return jsonError("Claims open after an active will has an approved verification.",409);
  const beneficiary=will.beneficiaries.find(b=>b.walletAddress.toLowerCase()===user.walletAddress!.toLowerCase());if(!beneficiary)return jsonError("This wallet is not a beneficiary of the will.",403);
  const body=await request.json();const details=typeof body.details==="string"?body.details.trim():"";if(details.length>1000)return jsonError("Claim details are limited to 1,000 characters.");
  const open=await prisma.inheritanceClaim.findFirst({where:{willId,beneficiaryId:beneficiary.id,status:{in:["SUBMITTED","UNDER_REVIEW"]}}});if(open)return Response.json({claim:open,idempotent:true});
  const claim=await prisma.inheritanceClaim.create({data:{willId,beneficiaryId:beneficiary.id,details:details||null}});
  await audit(user.id,user.role,"CLAIM_SUBMITTED",willId,claim.id);
  return Response.json({claim},{status:201});
 }catch(error){return serverError(error);}
}
