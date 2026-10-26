import { Contract, JsonRpcProvider, Interface, getAddress, isHexString } from "ethers";
import { assertHardhatChainId, ChainValidationError } from "@/lib/chain-id.js";
const abi = [
  "function getWill(bytes32) view returns (tuple(address testator,bytes32 documentHash,uint64 createdAt,uint32 version,uint8 status,uint8 verification,bool executed,bytes32 verificationRef))",
  "function getWillVersion(bytes32,uint32) view returns (bytes32)",
  "function getBeneficiaries(bytes32) view returns (address[],uint16[])",
  "function VERIFIER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "event WillCreated(bytes32 indexed willId,address indexed testator,bytes32 documentHash,uint32 version)",
  "event WillUpdated(bytes32 indexed willId,bytes32 documentHash,uint32 version)",
  "event WillRevoked(bytes32 indexed willId)",
  "event VerificationSubmitted(bytes32 indexed willId,bytes32 indexed referenceHash)",
  "event VerificationDecided(bytes32 indexed willId,bool approved,bytes32 indexed referenceHash)",
  "event InheritanceExecuted(bytes32 indexed willId,address indexed verifier,uint64 timestamp)",
  "event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)",
  "event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)"
];
export const registryInterface = new Interface(abi);
export function registryAddress() {
  const address = process.env.WILL_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_WILL_REGISTRY;
  if (!address) throw new Error("WILL_REGISTRY_ADDRESS is not configured.");
  return getAddress(address);
}
export function chainProvider() {
  return new JsonRpcProvider(process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545", 31337, { staticNetwork: true });
}
export function registry() { return new Contract(registryAddress(), abi, chainProvider()); }
export function validBytes32(value: unknown): value is string { return typeof value === "string" && isHexString(value, 32); }
export function validTxHash(value: unknown): value is string { return typeof value === "string" && isHexString(value, 32); }
export async function verifyTransaction(input: { txHash: string; willId: string; action: "WillCreated" | "WillUpdated" | "WillRevoked" | "VerificationSubmitted" | "VerificationDecided" | "InheritanceExecuted"; actorAddress?: string; documentHash?: string; version?: number; referenceHash?: string; approved?: boolean }) {
  if (!validTxHash(input.txHash) || !validBytes32(input.willId)) throw new ChainValidationError("Transaction hash or will identifier is malformed.");
  const provider = chainProvider();
  await assertHardhatChainId(provider);
  const receipt = await provider.getTransactionReceipt(input.txHash);
  if (!receipt || receipt.status !== 1) throw new ChainValidationError("Transaction is not confirmed successfully on the local chain.");
  const tx = await provider.getTransaction(input.txHash);
  if (!tx || (input.actorAddress && tx.from.toLowerCase() !== input.actorAddress.toLowerCase())) throw new ChainValidationError("Transaction signer does not match the authenticated wallet.");
  let found = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registryAddress().toLowerCase()) continue;
    try {
      const event = registryInterface.parseLog(log);
      if (!event || event.name !== input.action || String(event.args.willId).toLowerCase() !== input.willId.toLowerCase()) continue;
      if (input.documentHash && String(event.args.documentHash).toLowerCase() !== input.documentHash.toLowerCase()) continue;
      if (input.version && Number(event.args.version) !== input.version) continue;
      if (input.referenceHash && String(event.args.referenceHash).toLowerCase() !== input.referenceHash.toLowerCase()) continue;
      if (input.approved !== undefined && Boolean(event.args.approved) !== input.approved) continue;
      found = true;
      break;
    } catch { /* Ignore logs not emitted by this registry interface. */ }
  }
  if (!found) throw new ChainValidationError(`Confirmed transaction does not contain the expected ${input.action} event for this will.`);
  return { receipt, tx };
}
export async function authoritativeWill(willId: string) {
  if (!validBytes32(willId)) throw new Error("Will identifier is malformed.");
  const provider = chainProvider();
  await assertHardhatChainId(provider);
  const contract = registry();
  const [record, beneficiaries] = await Promise.all([contract.getWill(willId), contract.getBeneficiaries(willId)]);
  return { record, beneficiaries };
}
export async function verifyVerifierRoleTransaction(input:{txHash:string;actorAddress:string;targetAddress:string;grant:boolean}){
  if(!validTxHash(input.txHash))throw new ChainValidationError("Transaction hash is malformed.");
  const provider=chainProvider();await assertHardhatChainId(provider);
  const receipt=await provider.getTransactionReceipt(input.txHash);if(!receipt||receipt.status!==1)throw new ChainValidationError("Role transaction is not confirmed successfully.");
  const tx=await provider.getTransaction(input.txHash);if(!tx||tx.from.toLowerCase()!==input.actorAddress.toLowerCase())throw new ChainValidationError("Role transaction signer does not match the linked administrator wallet.");
  const contract=registry();const role=String(await contract.VERIFIER_ROLE());const expectedEvent=input.grant?"RoleGranted":"RoleRevoked";
  const match=receipt.logs.some(log=>{if(log.address.toLowerCase()!==registryAddress().toLowerCase())return false;try{const event=registryInterface.parseLog(log);return !!event&&event.name===expectedEvent&&String(event.args.role).toLowerCase()===role.toLowerCase()&&String(event.args.account).toLowerCase()===input.targetAddress.toLowerCase();}catch{return false;}});
  if(!match)throw new ChainValidationError(`Transaction does not contain the expected ${expectedEvent} event.`);
  const active=Boolean(await contract.hasRole(role,input.targetAddress));if(active!==input.grant)throw new ChainValidationError("Verifier role state does not match the confirmed transaction.");
  return {receipt,tx};
}

