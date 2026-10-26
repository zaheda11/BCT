import { currentUser, jsonError, serverError, audit } from "@/lib/auth";
import { authoritativeWill } from "@/lib/chain";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request, context: { params: Promise<{ willId: string }> }) {
 try {
  const user=await currentUser(); if(!user)return jsonError("Sign in first.",401);
  if(user.role!=="TESTATOR")return jsonError("Only a testator can manage asset instructions.",403);
  const {willId}=await context.params; const will=await prisma.will.findFirst({where:{id:willId,testatorId:user.id}});
  if(!will)return jsonError("Will not found or not owned by this account.",404);
  const chain=await authoritativeWill(willId); if(Number(chain.record.status)!==1||chain.record.executed)return jsonError("Assets can only be added to an active, unexecuted will.",409);
  const body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))return jsonError("Request body must be a JSON object.");
  const category=typeof body.category==="string"?body.category.trim():""; const description=typeof body.description==="string"?body.description.trim():"";
  if(!category||category.length>80||!description||description.length>500)return jsonError("Asset category or description is invalid.");
  if(body.allocations!==undefined&&!Array.isArray(body.allocations))return jsonError("Asset allocations must be an array.");
  const allocations=Array.isArray(body.allocations)?body.allocations:[];
  if(allocations.length){
   const seen=new Set<string>();
   const invalid=allocations.some((a:{walletAddress?:unknown;allocationBps?:unknown})=>{
    if(!a||typeof a.walletAddress!=="string"||!/^0x[0-9a-fA-F]{40}$/.test(a.walletAddress)||!Number.isInteger(a.allocationBps)||Number(a.allocationBps)<1)return true;
    const key=a.walletAddress.toLowerCase();if(seen.has(key))return true;seen.add(key);return false;
   });
   if(invalid||allocations.reduce((n:number,a:{allocationBps:number})=>n+a.allocationBps,0)!==10000)return jsonError("Asset allocations must use unique beneficiary wallets and total exactly 10,000 basis points.");
  }
  const beneficiaries=await prisma.beneficiary.findMany({where:{willId}}); const known=new Set(beneficiaries.map(b=>b.walletAddress.toLowerCase()));
  if(allocations.some((a:{walletAddress:string})=>!known.has(String(a.walletAddress).toLowerCase())))return jsonError("Asset allocations must reference beneficiaries in this will.");
  const version=Number(chain.record.version);
  const asset=await prisma.asset.create({data:{willId,version,category,description,declaredValue:typeof body.declaredValue==="string"?body.declaredValue.slice(0,80):null,ownershipReference:typeof body.ownershipReference==="string"?body.ownershipReference.slice(0,250):null,allocations:{create:await Promise.all(allocations.map(async(a:{walletAddress:string;allocationBps:number})=>({allocationBps:a.allocationBps,beneficiary:{connect:{id:beneficiaries.find(b=>b.walletAddress.toLowerCase()===a.walletAddress.toLowerCase())!.id}}})))}}});
  await audit(user.id,user.role,"ASSET_INSTRUCTION_ADDED",willId,asset.id);
  return Response.json({asset}, {status:201});
 }catch(error){return serverError(error);}
}
