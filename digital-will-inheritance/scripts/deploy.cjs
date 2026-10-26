const { ethers } = require("hardhat");
async function main() { const [admin, verifier] = await ethers.getSigners(); const C = await ethers.getContractFactory("WillRegistry"); const c = await C.deploy(admin.address, verifier.address); await c.waitForDeployment(); console.log(JSON.stringify({ address: await c.getAddress(), admin: admin.address, verifier: verifier.address, network: "hardhat-local", chainId: 31337 }, null, 2)); }
main().catch(e => { console.error(e); process.exitCode = 1; });
