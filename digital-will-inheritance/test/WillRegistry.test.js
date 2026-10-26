const { expect } = require("chai");
const { ethers } = require("hardhat");
describe("WillRegistry", function () {
 async function deploy() {
  const [admin,testator,verifier,a,b,c,outsider]=await ethers.getSigners();
  const Factory=await ethers.getContractFactory("WillRegistry");
  const contract=await Factory.deploy(admin.address,verifier.address);
  return {contract,admin,testator,verifier,a,b,c,outsider};
 }
 const wid=ethers.keccak256(ethers.toUtf8Bytes("will-ahmed"));
 const hash=ethers.keccak256(ethers.toUtf8Bytes("document-v1"));
 const ref=ethers.keccak256(ethers.toUtf8Bytes("DEMO-001"));
 it("registers a will with validated allocations and version 1",async()=>{
  const {contract,testator,a,b,c}=await deploy();
  await expect(contract.connect(testator).createWill(wid,hash,[a.address,b.address,c.address],[5000,3000,2000])).to.emit(contract,"WillCreated");
  expect((await contract.getWill(wid)).version).eq(1);
  const [,shares]=await contract.getBeneficiaries(wid);
  expect(shares.map(Number)).deep.eq([5000,3000,2000]);
 });
 it("rejects invalid allocation totals, empty beneficiaries, and duplicate addresses",async()=>{
  const {contract,testator,a,b}=await deploy();
  await expect(contract.connect(testator).createWill(wid,hash,[a.address,b.address],[6000,3000])).revertedWith("allocations must equal 10000 bps");
  await expect(contract.connect(testator).createWill(wid,hash,[],[])).revertedWith("invalid beneficiary arrays");
  await expect(contract.connect(testator).createWill(wid,hash,[a.address,a.address],[5000,5000])).revertedWith("duplicate beneficiary");
  await expect(contract.connect(testator).createWill(ethers.ZeroHash,hash,[a.address,b.address],[5000,5000])).revertedWith("empty identifier/hash");
 });
 it("retains old hashes when the testator revises a will",async()=>{
  const {contract,testator,outsider,a,b,c}=await deploy();
  await contract.connect(testator).createWill(wid,hash,[a.address,b.address],[5000,5000]);
  const next=ethers.keccak256(ethers.toUtf8Bytes("document-v2"));
  await expect(contract.connect(outsider).updateWill(wid,next,[a.address,b.address],[5000,5000])).revertedWith("only testator");
  await contract.connect(testator).updateWill(wid,next,[a.address,b.address,c.address],[5000,3000,2000]);
  expect(await contract.getWillVersion(wid,1)).eq(hash);
  expect(await contract.getWillVersion(wid,2)).eq(next);
 });
 it("blocks revisions during verification and permits one retry after rejection",async()=>{
  const {contract,testator,verifier,a,b}=await deploy();
  await contract.connect(testator).createWill(wid,hash,[a.address,b.address],[5000,5000]);
  await contract.connect(verifier).submitVerification(wid,ref);
  await expect(contract.connect(testator).updateWill(wid,hash,[a.address,b.address],[5000,5000])).revertedWith("verification in progress");
  await expect(contract.connect(verifier).submitVerification(wid,ref)).revertedWith("verification already active");
  await contract.connect(verifier).decideVerification(wid,false,ref);
  await contract.connect(testator).updateWill(wid,hash,[a.address,b.address],[5000,5000]);
  expect((await contract.getWill(wid)).version).eq(2);
 });
 it("restricts verification and requires approval before one-time execution",async()=>{
  const {contract,testator,verifier,outsider,a,b}=await deploy();
  await contract.connect(testator).createWill(wid,hash,[a.address,b.address],[5000,5000]);
  await expect(contract.connect(outsider).submitVerification(wid,ref)).reverted;
  await contract.connect(verifier).submitVerification(wid,ref);
  await expect(contract.connect(verifier).executeInheritance(wid)).revertedWith("verification not approved");
  await contract.connect(verifier).decideVerification(wid,true,ref);
  await contract.connect(verifier).executeInheritance(wid);
  await expect(contract.connect(verifier).executeInheritance(wid)).revertedWith("already executed");
 });
 it("allows verification rejection and blocks execution",async()=>{
  const {contract,testator,verifier,a,b}=await deploy();
  await contract.connect(testator).createWill(wid,hash,[a.address,b.address],[5000,5000]);
  await contract.connect(verifier).submitVerification(wid,ref);
  await contract.connect(verifier).decideVerification(wid,false,ref);
  expect((await contract.getWill(wid)).verification).eq(3);
  await expect(contract.connect(verifier).executeInheritance(wid)).revertedWith("verification not approved");
 });
 it("allows revocation and prevents edits after revocation",async()=>{
  const {contract,testator,a,b}=await deploy();
  await contract.connect(testator).createWill(wid,hash,[a.address,b.address],[5000,5000]);
  await contract.connect(testator).revokeWill(wid);
  await expect(contract.connect(testator).updateWill(wid,hash,[a.address,b.address],[5000,5000])).revertedWith("will not editable");
 });
 it("rejects unknown will and version reads",async()=>{
  const {contract}=await deploy();
  await expect(contract.getWill(wid)).revertedWith("unknown will");
  await expect(contract.getWillVersion(wid,1)).revertedWith("unknown will version");
  await expect(contract.getBeneficiaries(wid)).revertedWith("unknown will");
 });
});
