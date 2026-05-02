import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { Signer } from "ethers";
import { FhevmType } from "@fhevm/mock-utils";
import { ConfidentialTBill } from "../types";

describe("ConfidentialTBill", function () {
  let tbill: ConfidentialTBill;
  let owner: Signer;
  let alice: Signer;
  let ownerAddr: string;
  let aliceAddr: string;
  let tokenAddr: string;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    aliceAddr = await alice.getAddress();

    const Factory = await ethers.getContractFactory("ConfidentialTBill");
    const deployed = await Factory.connect(owner).deploy(ownerAddr);
    await deployed.waitForDeployment();
    tbill = deployed as unknown as ConfidentialTBill;
    tokenAddr = await tbill.getAddress();
  });

  async function mint(to: string, amount: bigint, sender: Signer = owner) {
    const senderAddr = await sender.getAddress();
    const buf = fhevm.createEncryptedInput(tokenAddr, senderAddr);
    buf.add64(amount);
    const enc = await buf.encrypt();
    return tbill
      .connect(sender)
      .mintEncrypted(to, enc.handles[0], enc.inputProof);
  }

  it("has the expected name + symbol", async () => {
    expect(await tbill.name()).to.equal("Tessera Confidential T-Bill");
    expect(await tbill.symbol()).to.equal("cTBILL");
  });

  it("mints an encrypted amount the recipient can decrypt", async () => {
    await mint(aliceAddr, 1_000_000n);
    const balanceHandle = await tbill.confidentialBalanceOf(aliceAddr);
    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      balanceHandle,
      tokenAddr,
      alice,
    );
    expect(clear).to.equal(1_000_000n);
  });

  it("only owner can mint", async () => {
    await expect(mint(aliceAddr, 1n, alice)).to.be.revertedWithCustomError(
      tbill,
      "OwnableUnauthorizedAccount",
    );
  });
});
