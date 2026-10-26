class ChainValidationError extends Error {}

async function assertHardhatChainId(provider) {
  const rawChainId = await provider.send("eth_chainId", []);
  let chainId;
  try {
    if (typeof rawChainId !== "string") throw new Error();
    chainId = BigInt(rawChainId);
  } catch {
    throw new ChainValidationError("Configured RPC returned an invalid chain ID.");
  }
  if (chainId !== 31337n) throw new ChainValidationError("Configured RPC is not Hardhat local chain 31337.");
}
module.exports = { assertHardhatChainId, ChainValidationError };
