import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { Signer } from "ethers";
import { FhevmType } from "@fhevm/mock-utils";
import { TesseraID } from "../types";

describe("TesseraID", function () {
  let tesseraID: TesseraID;
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let ownerAddr: string;
  let aliceAddr: string;
  let bobAddr: string;
  let contractAddr: string;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();

    const Factory = await ethers.getContractFactory("TesseraID");
    const deployed = await Factory.connect(owner).deploy(ownerAddr);
    await deployed.waitForDeployment();
    tesseraID = deployed as unknown as TesseraID;
    contractAddr = await tesseraID.getAddress();
  });

  async function attest(
    target: string,
    {
      tier = 1,
      jurisdiction = 826, // GB
      aum = 3,
      sender = owner,
    }: { tier?: number; jurisdiction?: number; aum?: number; sender?: Signer } = {},
  ) {
    const senderAddr = await sender.getAddress();
    const buf = fhevm.createEncryptedInput(contractAddr, senderAddr);
    buf.add8(tier);
    buf.add16(jurisdiction);
    buf.add8(aum);
    const enc = await buf.encrypt();
    return tesseraID
      .connect(sender)
      .attest(
        target,
        enc.handles[0],
        enc.inputProof,
        enc.handles[1],
        enc.inputProof,
        enc.handles[2],
        enc.inputProof,
      );
  }

  it("mints a token to the holder on attest", async () => {
    await expect(attest(aliceAddr))
      .to.emit(tesseraID, "Attested")
      .withArgs(aliceAddr, 1);
    expect(await tesseraID.tokenIdOf(aliceAddr)).to.equal(1n);
    expect(await tesseraID.ownerOf(1)).to.equal(aliceAddr);
  });

  it("rejects double-attestation for the same holder", async () => {
    await attest(aliceAddr);
    await expect(attest(aliceAddr)).to.be.revertedWithCustomError(
      tesseraID,
      "AlreadyAttested",
    );
  });

  it("only owner can attest", async () => {
    await expect(attest(aliceAddr, { sender: alice })).to.be.revertedWithCustomError(
      tesseraID,
      "OwnableUnauthorizedAccount",
    );
  });

  it("is soulbound — peer-to-peer transfers revert", async () => {
    await attest(aliceAddr);
    await expect(
      tesseraID.connect(alice).transferFrom(aliceAddr, bobAddr, 1),
    ).to.be.revertedWithCustomError(tesseraID, "Soulbound");
  });

  it("holder can decrypt their own tier", async () => {
    await attest(aliceAddr, { tier: 2 });
    const handle = await tesseraID.tierOf(aliceAddr);
    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      handle,
      contractAddr,
      alice,
    );
    expect(clear).to.equal(2n);
  });

  it("holder can decrypt jurisdiction and AUM bracket", async () => {
    await attest(aliceAddr, { tier: 1, jurisdiction: 840, aum: 4 });
    const jHandle = await tesseraID.jurisdictionOf(aliceAddr);
    const aHandle = await tesseraID.aumBracketOf(aliceAddr);
    const j = await fhevm.userDecryptEuint(
      FhevmType.euint16,
      jHandle,
      contractAddr,
      alice,
    );
    const a = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      aHandle,
      contractAddr,
      alice,
    );
    expect(j).to.equal(840n);
    expect(a).to.equal(4n);
  });

  it("shareAttrsWith grants a third party decryption rights", async () => {
    await attest(aliceAddr, { tier: 3 });
    await tesseraID.connect(alice).shareAttrsWith(bobAddr);
    const handle = await tesseraID.tierOf(aliceAddr);
    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      handle,
      contractAddr,
      bob,
    );
    expect(clear).to.equal(3n);
  });

  it("shareAttrsWith reverts if caller has no token", async () => {
    await expect(
      tesseraID.connect(alice).shareAttrsWith(bobAddr),
    ).to.be.revertedWithCustomError(tesseraID, "NoToken");
  });
});
