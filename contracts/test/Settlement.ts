import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { Signer } from "ethers";
import { FhevmType } from "@fhevm/mock-utils";
import {
  ConfidentialTBill,
  ConfidentialUSDC,
  Settlement,
} from "../types";

describe("Settlement (atomic DvP)", function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let mallory: Signer;
  let ownerAddr: string;
  let aliceAddr: string;
  let bobAddr: string;
  let malloryAddr: string;

  let tbill: ConfidentialTBill;
  let usdc: ConfidentialUSDC;
  let settlement: Settlement;
  let tbillAddr: string;
  let usdcAddr: string;
  let settlementAddr: string;

  beforeEach(async () => {
    [owner, alice, bob, mallory] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();
    malloryAddr = await mallory.getAddress();

    const TBillF = await ethers.getContractFactory("ConfidentialTBill");
    tbill = (await TBillF.connect(owner).deploy(ownerAddr)) as unknown as ConfidentialTBill;
    await tbill.waitForDeployment();
    tbillAddr = await tbill.getAddress();

    const USDCF = await ethers.getContractFactory("ConfidentialUSDC");
    usdc = (await USDCF.connect(owner).deploy(ownerAddr)) as unknown as ConfidentialUSDC;
    await usdc.waitForDeployment();
    usdcAddr = await usdc.getAddress();

    const SettlementF = await ethers.getContractFactory("Settlement");
    settlement = (await SettlementF.connect(owner).deploy(
      tbillAddr,
      usdcAddr,
    )) as unknown as Settlement;
    await settlement.waitForDeployment();
    settlementAddr = await settlement.getAddress();

    // Grant Settlement permission to move tokens
    await tbill.connect(owner).setSettler(settlementAddr);
    await usdc.connect(owner).setSettler(settlementAddr);

    // Seed: Alice has 1,000,000 cTBILL, Bob has 1,000,000 cUSDC.
    await tbill.connect(owner).mintClear(aliceAddr, 1_000_000n);
    await usdc.connect(owner).mintClear(bobAddr, 1_000_000n);
  });

  async function readBalance(token: ConfidentialTBill | ConfidentialUSDC, holder: Signer) {
    const tokenAddr = await token.getAddress();
    const handle = await token.confidentialBalanceOf(await holder.getAddress());
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddr, holder);
  }

  async function signOffer(
    signer: Signer,
    args: {
      seller: string;
      buyer: string;
      sellAsset: string;
      buyAsset: string;
      sellAmount: bigint;
      buyAmount: bigint;
      nonce: bigint;
      deadline: bigint;
    },
  ) {
    // Chain-independent EIP-712 minimal domain (matches Settlement.DOMAIN_HASH).
    return signer.signTypedData(
      {
        name: "Tessera",
        version: "1",
      },
      {
        DvP: [
          { name: "seller", type: "address" },
          { name: "buyer", type: "address" },
          { name: "sellAsset", type: "address" },
          { name: "buyAsset", type: "address" },
          { name: "sellAmount", type: "uint64" },
          { name: "buyAmount", type: "uint64" },
          { name: "nonce", type: "uint64" },
          { name: "deadline", type: "uint256" },
        ],
      },
      args,
    );
  }

  it("settles atomically when both parties have signed valid offers", async () => {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const args = {
      seller: aliceAddr,
      buyer: bobAddr,
      sellAsset: tbillAddr,
      buyAsset: usdcAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 1n,
      deadline,
    };
    const sellerSig = await signOffer(alice, args);
    const buyerSig = await signOffer(bob, args);

    await expect(
      settlement.settleAtomic(
        args.seller,
        args.buyer,
        args.sellAsset,
        args.buyAsset,
        args.sellAmount,
        args.buyAmount,
        args.nonce,
        args.deadline,
        sellerSig,
        buyerSig,
      ),
    ).to.emit(settlement, "Settled");

    expect(await readBalance(tbill, alice)).to.equal(900_000n);
    expect(await readBalance(tbill, bob)).to.equal(100_000n);
    expect(await readBalance(usdc, alice)).to.equal(99_800n);
    expect(await readBalance(usdc, bob)).to.equal(900_200n);
  });

  it("reverts on expired deadline", async () => {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp - 1);
    const args = {
      seller: aliceAddr,
      buyer: bobAddr,
      sellAsset: tbillAddr,
      buyAsset: usdcAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 1n,
      deadline,
    };
    const sellerSig = await signOffer(alice, args);
    const buyerSig = await signOffer(bob, args);

    await expect(
      settlement.settleAtomic(
        args.seller,
        args.buyer,
        args.sellAsset,
        args.buyAsset,
        args.sellAmount,
        args.buyAmount,
        args.nonce,
        args.deadline,
        sellerSig,
        buyerSig,
      ),
    ).to.be.revertedWithCustomError(settlement, "Expired");
  });

  it("reverts when seller signature is forged", async () => {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const args = {
      seller: aliceAddr,
      buyer: bobAddr,
      sellAsset: tbillAddr,
      buyAsset: usdcAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 1n,
      deadline,
    };
    // Mallory pretends to be Alice
    const malicious = await signOffer(mallory, args);
    const buyerSig = await signOffer(bob, args);

    await expect(
      settlement.settleAtomic(
        args.seller,
        args.buyer,
        args.sellAsset,
        args.buyAsset,
        args.sellAmount,
        args.buyAmount,
        args.nonce,
        args.deadline,
        malicious,
        buyerSig,
      ),
    ).to.be.revertedWithCustomError(settlement, "InvalidSellerSig");
  });

  it("reverts when same asset on both sides", async () => {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const args = {
      seller: aliceAddr,
      buyer: bobAddr,
      sellAsset: tbillAddr,
      buyAsset: tbillAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 1n,
      deadline,
    };
    const sellerSig = await signOffer(alice, args);
    const buyerSig = await signOffer(bob, args);
    await expect(
      settlement.settleAtomic(
        args.seller,
        args.buyer,
        args.sellAsset,
        args.buyAsset,
        args.sellAmount,
        args.buyAmount,
        args.nonce,
        args.deadline,
        sellerSig,
        buyerSig,
      ),
    ).to.be.revertedWithCustomError(settlement, "SameAsset");
  });

  it("settles an open offer (buyer=address(0)) for any taker", async () => {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const open = {
      seller: aliceAddr,
      buyer: ethers.ZeroAddress,
      sellAsset: tbillAddr,
      buyAsset: usdcAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 7n,
      deadline,
    };
    const sellerSig = await signOffer(alice, open);
    const takerView = { ...open, buyer: bobAddr };
    const takerSig = await signOffer(bob, takerView);

    await expect(
      settlement.settleOpenOffer(
        aliceAddr,
        bobAddr,
        tbillAddr,
        usdcAddr,
        100_000n,
        99_800n,
        7n,
        deadline,
        sellerSig,
        takerSig,
      ),
    ).to.emit(settlement, "Settled");

    expect(await readBalance(tbill, alice)).to.equal(900_000n);
    expect(await readBalance(tbill, bob)).to.equal(100_000n);
    expect(await readBalance(usdc, alice)).to.equal(99_800n);
    expect(await readBalance(usdc, bob)).to.equal(900_200n);
  });

  it("rejects an open offer if the seller's signature has the wrong buyer", async () => {
    // Adversary case: seller signed for a SPECIFIC buyer, but server tries to
    // route through settleOpenOffer with a different taker.
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const args = {
      seller: aliceAddr,
      buyer: bobAddr, // closed offer, NOT open
      sellAsset: tbillAddr,
      buyAsset: usdcAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 8n,
      deadline,
    };
    const sellerSig = await signOffer(alice, args); // signed with buyer=bob
    const takerSig = await signOffer(mallory, { ...args, buyer: malloryAddr });

    await expect(
      settlement.settleOpenOffer(
        aliceAddr,
        malloryAddr,
        tbillAddr,
        usdcAddr,
        100_000n,
        99_800n,
        8n,
        deadline,
        sellerSig,
        takerSig,
      ),
    ).to.be.revertedWithCustomError(settlement, "InvalidSellerSig");
  });

  it("rejects replay of an already-settled offer", async () => {
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const args = {
      seller: aliceAddr,
      buyer: bobAddr,
      sellAsset: tbillAddr,
      buyAsset: usdcAddr,
      sellAmount: 100_000n,
      buyAmount: 99_800n,
      nonce: 42n,
      deadline,
    };
    const sellerSig = await signOffer(alice, args);
    const buyerSig = await signOffer(bob, args);

    await settlement.settleAtomic(
      args.seller,
      args.buyer,
      args.sellAsset,
      args.buyAsset,
      args.sellAmount,
      args.buyAmount,
      args.nonce,
      args.deadline,
      sellerSig,
      buyerSig,
    );

    await expect(
      settlement.settleAtomic(
        args.seller,
        args.buyer,
        args.sellAsset,
        args.buyAsset,
        args.sellAmount,
        args.buyAmount,
        args.nonce,
        args.deadline,
        sellerSig,
        buyerSig,
      ),
    ).to.be.revertedWithCustomError(settlement, "AlreadySettled");
  });
});
