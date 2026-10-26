const { createHash, randomBytes } = require("node:crypto");
const { JsonRpcProvider, Contract, Wallet, parseEther, keccak256, toUtf8Bytes } = require("ethers");
process.loadEnvFile?.(".env");
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const rpc = process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545";
const address = process.env.WILL_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_WILL_REGISTRY;
const abi = [
 "function createWill(bytes32,bytes32,address[],uint16[])",
 "function getWill(bytes32) view returns (tuple(address testator,bytes32 documentHash,uint64 createdAt,uint32 version,uint8 status,uint8 verification,bool executed,bytes32 verificationRef))",
 "function submitVerification(bytes32,bytes32)","function decideVerification(bytes32,bool,bytes32)","function executeInheritance(bytes32)",
 "function VERIFIER_ROLE() view returns (bytes32)","function grantRole(bytes32,address)","function revokeRole(bytes32,address)"
];
function assert(ok, message) { if (!ok) throw new Error(message); }
async function call(path, { method="GET", cookie, body, form }={}) {
 const headers = {}; if (cookie) headers.Cookie = cookie; if (body !== undefined) headers["Content-Type"] = "application/json";
 const response = await fetch(`${base}${path}`, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
 const data = await response.json();
 if (!response.ok) throw new Error(`${method} ${path}: ${data.error || response.status}`);
 return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function account(index, provider) { return provider.getSigner(index); }
async function register(email, role, signer, password) {
 const { data, cookie } = await call("/api/auth/register", { method:"POST", body:{ name: role === "TESTATOR" ? "Ahmed (sample)" : "Demo beneficiary", email, password, role } });
 const challenge = (await call("/api/auth/wallet/challenge", { method:"POST", cookie })).data;
 const signature = await signer.signMessage(challenge.message);
 const link = await call("/api/auth/wallet", { method:"POST", cookie, body:{ message:challenge.message, signature } });
 return { user:data.user, cookie, wallet:link.data.walletAddress };
}
async function login(email, password, signer) {
 const { data, cookie } = await call("/api/auth/login", { method:"POST", body:{ email, password } });
 if (signer) {
  const challenge=(await call("/api/auth/wallet/challenge",{method:"POST",cookie})).data;
  const signature=await signer.signMessage(challenge.message);
  const linked=await call("/api/auth/wallet",{method:"POST",cookie,body:{message:challenge.message,signature}});
  return { user:data.user, cookie, wallet:linked.data.walletAddress };
 }
 return { user:data.user,cookie };
}
async function recordEvent(cookie, willId, action, txHash, referenceHash, approved) {
 const path=`/api/wills/${willId}/events`;const body={action,txHash,referenceHash,approved};
 const first=await call(path,{method:"POST",cookie,body});const replay=await call(path,{method:"POST",cookie,body});
 assert(replay.data.idempotent===true,"Replayed chain event was not handled idempotently.");
 return first;
}
async function expectStatus(path, cookie, status, options={}) {
 const headers={};if(cookie)headers.Cookie=cookie;if(options.body!==undefined)headers["Content-Type"]="application/json";
 const response=await fetch(`${base}${path}`,{method:options.method||"GET",headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
 assert(response.status===status,`${options.method||"GET"} ${path} expected HTTP ${status}, received ${response.status}.`);
 return response;
}
async function main() {
 assert(address, "Set WILL_REGISTRY_ADDRESS in .env after deployment.");
 const home=await fetch(base);assert(home.ok&&home.headers.get("x-frame-options")==="DENY"&&home.headers.get("x-content-type-options")==="nosniff","Expected security headers are missing from the application response.");
 const provider=new JsonRpcProvider(rpc,31337,{staticNetwork:true});
 const adminSigner=await account(0,provider);const verifierSigner=await account(1,provider);
 const testatorSigner=Wallet.createRandom().connect(provider);const wifeSigner=Wallet.createRandom();const sonSigner=Wallet.createRandom();const daughterSigner=Wallet.createRandom();
 await (await adminSigner.sendTransaction({to:await testatorSigner.getAddress(),value:parseEther("1")})).wait();
 const stamp=Date.now();
 const testatorPassword=randomBytes(24).toString("base64url");
 const wifePassword=randomBytes(24).toString("base64url");
 const testator=await register(`ahmed-${stamp}@demo.local`,"TESTATOR",testatorSigner,testatorPassword);
 const wife=await register(`wife-${stamp}@demo.local`,"BENEFICIARY",wifeSigner,wifePassword);
 const verifier=await login(process.env.VERIFIER_EMAIL,process.env.VERIFIER_PASSWORD,verifierSigner);
 const admin=await login(process.env.ADMIN_EMAIL,process.env.ADMIN_PASSWORD,adminSigner);
 const contract=new Contract(address,abi,testatorSigner);
 const title=`Ahmed local demo ${stamp}`;
 const willId=keccak256(toUtf8Bytes(title));
 const bytes=Buffer.from("Sample will document for a local university demonstration. Not a legal instrument.\n","utf8");
 const documentHash="0x"+createHash("sha256").update(bytes).digest("hex");
 const wallets=await Promise.all([wifeSigner.getAddress(),sonSigner.getAddress(),daughterSigner.getAddress()]);
 const tx=await contract.createWill(willId,documentHash,wallets,[5000,3000,2000]);const receipt=await tx.wait();
 const beneficiaries=[{name:"Wife",relationship:"Spouse",walletAddress:wallets[0],allocationBps:5000},{name:"Son",relationship:"Son",walletAddress:wallets[1],allocationBps:3000},{name:"Daughter",relationship:"Daughter",walletAddress:wallets[2],allocationBps:2000}];
 const allocations=beneficiaries.map(({walletAddress,allocationBps})=>({walletAddress,allocationBps}));
 await expectStatus("/api/wills",wife.cookie,403,{method:"POST",body:{}});
 await call("/api/wills",{method:"POST",cookie:testator.cookie,body:{willId,title,documentHash,txHash:receipt.hash,version:1,beneficiaries,assets:[{category:"REAL_ESTATE",description:"House — sample value ₹50,00,000",declaredValue:"₹50,00,000",allocations},{category:"BANK_DEPOSIT",description:"Bank deposit — sample value ₹10,00,000",declaredValue:"₹10,00,000",allocations}]}});
 const repeatedAllocations=[{walletAddress:wallets[0],allocationBps:5000},{walletAddress:wallets[0],allocationBps:5000}];
 await expectStatus(`/api/wills/${willId}/assets`,testator.cookie,400,{method:"POST",body:{category:"TEST",description:"Invalid duplicate allocation",allocations:repeatedAllocations}});
 const invalidPdf=new FormData();invalidPdf.set("file",new File([Buffer.from("not a PDF")],"invalid.pdf",{type:"application/pdf"}));
 const invalidUpload=await fetch(`${base}/api/wills/${willId}/documents`,{method:"POST",headers:{Cookie:testator.cookie},body:invalidPdf});
 assert(invalidUpload.status===400,"Invalid document contents were not rejected.");
 const willDocs=new FormData();willDocs.set("file",new File([bytes],"sample-will.txt",{type:"text/plain"}));
 await call(`/api/wills/${willId}/documents`,{method:"POST",cookie:testator.cookie,form:willDocs});
 const listed=(await call("/api/wills",{cookie:testator.cookie})).data.wills.find(w=>w.id===willId);
 assert(listed&&listed.assets.length===2&&listed.beneficiaries.length===3&&listed.documents.length===1,"Will, sample assets, beneficiaries, and file did not persist.");
 const verifyFile=new FormData();verifyFile.set("file",new File([bytes],"copy.txt",{type:"text/plain"}));
 const verifyResult=(await call(`/api/documents/${listed.documents[0].id}/verify`,{method:"POST",cookie:testator.cookie,form:verifyFile})).data;
 assert(verifyResult.matches,"Original document bytes did not match registered SHA-256.");
 const invalidVerify=new FormData();invalidVerify.set("file",new File([Buffer.from([0])],"invalid.txt",{type:"text/plain"}));
 const invalidVerifyResponse=await fetch(`${base}/api/documents/${listed.documents[0].id}/verify`,{method:"POST",headers:{Cookie:testator.cookie},body:invalidVerify});
 assert(invalidVerifyResponse.status===400,"Invalid verification upload was not rejected with a client error.");
 const altered=new FormData();altered.set("file",new File([Buffer.concat([bytes,Buffer.from("changed")])],"changed.txt",{type:"text/plain"}));
 const mismatch=(await call(`/api/documents/${listed.documents[0].id}/verify`,{method:"POST",cookie:testator.cookie,form:altered})).data;
 assert(!mismatch.matches,"Modified file incorrectly matched the registered SHA-256.");
 const ref=keccak256(toUtf8Bytes("DEMO-VERIFICATION-001"));const verifierContract=contract.connect(verifierSigner);
 const failedTxHash="0x"+"0".repeat(64);
 await expectStatus(`/api/wills/${willId}/events`,verifier.cookie,409,{method:"POST",body:{action:"INHERITANCE_EXECUTED",txHash:failedTxHash}});
 const {PrismaClient}=require("@prisma/client");const dbCheck=new PrismaClient();
 const failedEvent=await dbCheck.blockchainTransaction.findUnique({where:{txHash:failedTxHash}});
 assert(!failedEvent,"An unconfirmed transaction was written to application history.");await dbCheck.$disconnect();
 let action=await verifierContract.submitVerification(willId,ref);let actionReceipt=await action.wait();await recordEvent(verifier.cookie,willId,"VERIFICATION_SUBMITTED",actionReceipt.hash,ref);
 action=await verifierContract.decideVerification(willId,true,ref);actionReceipt=await action.wait();await recordEvent(verifier.cookie,willId,"VERIFICATION_DECIDED",actionReceipt.hash,ref,true);
 const beneficiary=await login(wife.user.email,wifePassword,wifeSigner);
 const claim=(await call(`/api/wills/${willId}/claims`,{method:"POST",cookie:beneficiary.cookie,body:{details:"Sample beneficiary claim for local workflow testing."}})).data.claim;
 const duplicateClaim=(await call(`/api/wills/${willId}/claims`,{method:"POST",cookie:beneficiary.cookie,body:{details:"Duplicate submission should return the existing open claim."}})).data.claim;
 assert(duplicateClaim.id===claim.id,"Duplicate open claim did not return the existing claim.");
 const claimFile=new FormData();claimFile.set("file",new File([Buffer.from("Sample supporting claim evidence.")],"claim.txt",{type:"text/plain"}));claimFile.set("claimId",claim.id);
 const claimDocument=(await call(`/api/wills/${willId}/documents`,{method:"POST",cookie:beneficiary.cookie,form:claimFile})).data.document;
 const supportingBytes=Buffer.from("Sample supporting claim evidence.");
 const ownDownload=await fetch(`${base}/api/documents/${claimDocument.id}`,{headers:{Cookie:beneficiary.cookie}});
 assert(ownDownload.status===200&&Buffer.from(await ownDownload.arrayBuffer()).equals(supportingBytes),"The authorized claimant could not retrieve their own decrypted document.");
 const unauthenticatedDownload=await fetch(`${base}/api/documents/${claimDocument.id}`);
 assert(unauthenticatedDownload.status===401,"Unauthenticated document download was not rejected.");
 const outsider=await register(`outsider-${stamp}@demo.local`,"BENEFICIARY",Wallet.createRandom(),randomBytes(24).toString("base64url"));
 await expectStatus(`/api/wills/${willId}`,outsider.cookie,403);
 await expectStatus(`/api/wills/${willId}/claims`,outsider.cookie,403);
 await expectStatus(`/api/wills/${willId}/documents`,outsider.cookie,403);
 await expectStatus(`/api/documents/${claimDocument.id}`,outsider.cookie,403);
 await expectStatus(`/api/wills/${willId}/claims`,outsider.cookie,403,{method:"POST",body:{details:"Unaffiliated beneficiary must not submit a claim."}});
 await expectStatus(`/api/wills/${willId}/claims`,verifier.cookie,403);
 await expectStatus(`/api/wills/${willId}/documents`,verifier.cookie,403);
 await expectStatus(`/api/documents/${claimDocument.id}`,verifier.cookie,403);
 const adminWallet=await adminSigner.getAddress();const adminContract=new Contract(address,abi,adminSigner);const verifierRole=await adminContract.VERIFIER_ROLE();
 action=await adminContract.grantRole(verifierRole,testator.wallet);actionReceipt=await action.wait();
 await call(`/api/admin/users/${testator.user.id}/verifier`,{method:"PATCH",cookie:admin.cookie,body:{action:"GRANT",txHash:actionReceipt.hash}});
 await expectStatus(`/api/admin/users/${testator.user.id}/verifier`,testator.cookie,403,{method:"PATCH",body:{action:"REVOKE",txHash:actionReceipt.hash}});
 let unauthorized=false;try{await call(`/api/claims/${claim.id}`,{method:"PATCH",cookie:testator.cookie,body:{status:"APPROVED"}});}catch{unauthorized=true;}assert(unauthorized,"Non-admin account could review a claim.");
 action=await adminContract.revokeRole(verifierRole,testator.wallet);actionReceipt=await action.wait();
 await call(`/api/admin/users/${testator.user.id}/verifier`,{method:"PATCH",cookie:admin.cookie,body:{action:"REVOKE",txHash:actionReceipt.hash}});
 action=await verifierContract.executeInheritance(willId);actionReceipt=await action.wait();await recordEvent(verifier.cookie,willId,"INHERITANCE_EXECUTED",actionReceipt.hash,ref);
 const finalState=await contract.getWill(willId);assert(finalState.executed===true,"Contract did not record execution.");
 let duplicateExecutionRejected=false;try{await verifierContract.executeInheritance(willId);}catch{duplicateExecutionRejected=true;}assert(duplicateExecutionRejected,"Repeated inheritance execution was not rejected.");
 const claims=(await call(`/api/wills/${willId}/claims`,{cookie:beneficiary.cookie})).data.claims;assert(claims.length===1,"Beneficiary claim did not appear in the portal.");
 const adminData=(await call("/api/admin/overview",{cookie:admin.cookie})).data;assert(adminData.metrics.wills>=1,"Admin dashboard did not read app data.");
 console.log(JSON.stringify({ok:true,willId,contract:address,creationTransaction:receipt.hash,executionTransaction:actionReceipt.hash,documentMatch:verifyResult.matches,modifiedFileRejected:!mismatch.matches,invalidUploadRejected:invalidUpload.status===400,invalidVerifyUploadRejected:invalidVerifyResponse.status===400,securityHeadersPresent:true,assets:listed.assets.length,beneficiaries:listed.beneficiaries.length,claimStatus:claims[0].status,duplicateClaimIdempotent:duplicateClaim.id===claim.id,authorizedClaimantDownloadSucceeded:true,unauthenticatedDownloadRejected:true,crossUserDocumentAndClaimAccessRejected:true,verifierClaimAndDocumentAccessRejected:true,chainEventReplayIdempotent:true,failedTransactionRejected:true,unauthorizedRoleAssignmentRejected:true,unauthorizedWillCreationRejected:true,duplicateExecutionRejected,finalContractExecuted:finalState.executed,adminMetrics:adminData.metrics,unauthorizedClaimReviewRejected:unauthorized},null,2));
 await provider.destroy();
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});




