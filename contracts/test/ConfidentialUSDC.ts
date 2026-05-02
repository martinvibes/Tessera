import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { Signer } from "ethers";
import { FhevmType } from "@fhevm/mock-utils";
import { ConfidentialUSDC } from "../types";

describe("ConfidentialUSDC", function () {
  let usdc: ConfidentialUSDC;
  let owner: Signer;
  let alice: Signer;
  let ownerAddr: string;
  let aliceAddr: string;
  let tokenAddr: string;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    aliceAddr = await alice.getAddress();

    const Factory = await ethers.getContractFactory("ConfidentialUSDC");
    const deployed = await Factory.connect(owner).deploy(ownerAddr);
    await deployed.waitForDeployment();
    usdc = deployed as unknown as ConfidentialUSDC;
    tokenAddr = await usdc.getAddress();
  });

  it("has the expected name + symbol", async () => {
    expect(await usdc.name()).to.equal("Tessera Confidential USDC");
    expect(await usdc.symbol()).to.equal("cUSDC");
  });

  it("mints an encrypted amount the recipient can decrypt", async () => {
    const buf = fhevm.createEncryptedInput(tokenAddr, ownerAddr);
    buf.add64(500_000n);
    const enc = await buf.encrypt();
    await usdc.connect(owner).mintEncrypted(aliceAddr, enc.handles[0], enc.inputProof);

    const handle = await usdc.confidentialBalanceOf(aliceAddr);
    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      handle,
      tokenAddr,
      alice,
    );
    expect(clear).to.equal(500_000n);
  });
});
