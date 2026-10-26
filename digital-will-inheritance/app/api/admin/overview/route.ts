import { currentUser, jsonError, serverError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(){
 try{
  const user=await currentUser();if(!user)return jsonError("Sign in first.",401);if(user.role!=="ADMIN")return jsonError("Administrator access required.",403);
  const [users,wills,pending,claims,transactions,auditEvents]=await Promise.all([
   prisma.user.findMany({select:{id:true,name:true,email:true,role:true,walletAddress:true,createdAt:true},orderBy:{createdAt:"desc"}}),
   prisma.will.count(),prisma.deathVerification.count({where:{status:"PENDING"}}),prisma.inheritanceClaim.count({where:{status:{in:["SUBMITTED","UNDER_REVIEW"]}}}),
   prisma.blockchainTransaction.findMany({take:50,orderBy:{createdAt:"desc"}}),
   prisma.auditEvent.findMany({take:100,include:{actor:{select:{name:true,email:true,role:true}}},orderBy:{createdAt:"desc"}})
  ]);
  return Response.json({users,metrics:{wills,pendingVerifications:pending,openClaims:claims},transactions,auditEvents});
 }catch(error){return serverError(error);}
}
