const { expect } = require("chai");
const { assertHardhatChainId } = require("../lib/chain-id");

describe("Hardhat chain ID guard", function () {
  it("accepts the local Hardhat chain ID", async function () {
    await expect(assertHardhatChainId({ send: async () => "0x7a69" })).to.eventually.equal(undefined);
  });
  it("rejects non-local and malformed chain ID responses", async function () {
    await expect(assertHardhatChainId({ send: async () => "0x1" })).to.be.rejectedWith("Configured RPC is not Hardhat local chain 31337.");
    await expect(assertHardhatChainId({ send: async () => null })).to.be.rejectedWith("Configured RPC returned an invalid chain ID.");
  });
});
