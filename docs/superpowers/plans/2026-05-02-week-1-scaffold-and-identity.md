# Tessera Week 1 — Scaffold + Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Tessera monorepo (Next.js + Hardhat workspaces), deploy three FHE-enabled contracts (`TesseraID`, `ConfidentialTBill`, `ConfidentialUSDC`) on Zama FHEVM Sepolia, and ship an end-to-end onboarding flow where a user logs in via Web3Auth, completes mock KYB, and receives a soulbound identity NFT plus test token balances.

**Architecture:** Two npm workspaces under one git repo: `contracts/` (Hardhat + `@fhevm/solidity` + OpenZeppelin `confidential-contracts` for ERC-7984) and `web/` (Next.js 14 App Router + Tailwind + Web3Auth Modal v10 + `@zama-fhe/relayer-sdk` for client-side encryption/decryption). KYB attestation is owner-gated on-chain — frontend posts encrypted inputs, the deployer key signs `attest()` to mint the soulbound NFT.

**Tech Stack:** Solidity 0.8.27, `@fhevm/solidity` ^0.11.1, `@fhevm/hardhat-plugin` ^0.4.2, OpenZeppelin `@openzeppelin/confidential-contracts`, Hardhat ^2.28, Next.js 14, TypeScript 5.9, Tailwind, shadcn/ui, `@web3auth/modal` v10, `@zama-fhe/relayer-sdk` ^0.4.1, ethers v6.

---

## File Structure

```
Tessera/
├── package.json                    # workspaces root
├── .gitignore
├── README.md
├── docs/superpowers/plans/
├── contracts/
│   ├── package.json                # Zama Hardhat template, customised
│   ├── hardhat.config.ts
│   ├── tsconfig.json
│   ├── contracts/
│   │   ├── TesseraID.sol           # soulbound NFT, encrypted KYB attrs
│   │   ├── ConfidentialTBill.sol   # ERC-7984 mock T-Bill
│   │   └── ConfidentialUSDC.sol    # ERC-7984 mock stablecoin
│   ├── deploy/
│   │   ├── 01_tessera_id.ts
│   │   ├── 02_tbill.ts
│   │   └── 03_usdc.ts
│   ├── test/
│   │   ├── TesseraID.ts
│   │   ├── ConfidentialTBill.ts
│   │   └── ConfidentialUSDC.ts
│   ├── tasks/
│   │   └── accounts.ts             # kept from template
│   └── deployments/                # generated
└── web/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                # landing
    │   ├── providers.tsx           # Web3AuthProvider
    │   ├── onboard/page.tsx        # KYB form
    │   └── dashboard/page.tsx      # encrypted positions
    ├── components/
    │   ├── ui/                     # shadcn primitives
    │   └── login-button.tsx
    ├── lib/
    │   ├── web3auth.ts             # client init
    │   ├── contracts.ts            # addresses + ABIs + helpers
    │   ├── fhe.ts                  # relayer SDK wrapper
    │   └── deployments/
    │       └── sepolia.json        # synced from contracts/deployments
    └── public/
```

---

## Task 1: Monorepo skeleton

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1.1: Write root package.json**

```json
{
  "name": "tessera",
  "version": "0.0.1",
  "private": true,
  "workspaces": ["contracts", "web"],
  "scripts": {
    "dev:web": "npm --workspace web run dev",
    "build:contracts": "npm --workspace contracts run compile",
    "test:contracts": "npm --workspace contracts run test",
    "deploy:sepolia": "npm --workspace contracts run deploy:sepolia"
  }
}
```

- [ ] **Step 1.2: Write .gitignore**

```
node_modules/
.env
.env.local
.next/
out/
dist/
artifacts/
cache/
coverage/
coverage.json
types/
fhevmTemp/
.DS_Store
*.log
contracts/deployments/localhost/
```

- [ ] **Step 1.3: Write minimal README.md** (placeholder, real one comes in Task 16).

- [ ] **Step 1.4: Commit**

```bash
git add package.json .gitignore README.md docs/
git commit -m "chore: initialize monorepo skeleton"
```

---

## Task 2: Bootstrap contracts workspace

**Files:**
- Create: `contracts/` (cloned from `zama-ai/fhevm-hardhat-template`)

- [ ] **Step 2.1: Clone Zama template into contracts/ and discard its git history**

```bash
git clone --depth 1 https://github.com/zama-ai/fhevm-hardhat-template.git contracts
rm -rf contracts/.git
```

- [ ] **Step 2.2: Strip example files we'll replace**

```bash
rm contracts/contracts/FHECounter.sol
rm contracts/test/FHECounter.ts
rm contracts/deploy/deploy.ts
rm contracts/tasks/FHECounter.ts
rm -rf contracts/deployments
```

- [ ] **Step 2.3: Remove the FHECounter import line from `contracts/hardhat.config.ts`**

Edit `contracts/hardhat.config.ts`, delete the line `import "./tasks/FHECounter";`.

- [ ] **Step 2.4: Set the contracts package name**

Edit `contracts/package.json`, set `"name": "@tessera/contracts"`.

- [ ] **Step 2.5: Install OpenZeppelin confidential-contracts**

```bash
npm --workspace contracts install @openzeppelin/confidential-contracts
```

- [ ] **Step 2.6: Verify install succeeds**

```bash
ls contracts/node_modules/@openzeppelin/confidential-contracts/contracts/token/ERC7984
```

Expected: directory exists.

- [ ] **Step 2.7: Commit**

```bash
git add contracts/
git commit -m "chore(contracts): bootstrap from Zama Hardhat template"
```

---

## Task 3: TesseraID.sol — soulbound institutional identity

**Files:**
- Create: `contracts/contracts/TesseraID.sol`

The institution's profile lives entirely in encrypted storage. Three encrypted attributes (`tier`, `jurisdiction`, `aumBracket`) all kept as `euint8` / `euint16` handles. ERC-721 minimal — no enumeration, no metadata URI. Soulbound by overriding `_update` to revert on transfer.

- [ ] **Step 3.1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8, euint16, externalEuint8, externalEuint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TesseraID — soulbound institutional identity with encrypted KYB attributes
/// @notice One token per institution. Tier / jurisdiction / AUM bracket stored as FHE handles.
contract TesseraID is ERC721, Ownable, ZamaEthereumConfig {
    error AlreadyAttested(address holder);
    error Soulbound();

    struct Attrs {
        euint8 tier;          // 1..4 (KYB tier)
        euint16 jurisdiction; // ISO-3166 numeric country code
        euint8 aumBracket;    // 1..5 ($, $$, $$$, $$$$, $$$$$)
    }

    uint256 private _nextId = 1;
    mapping(address => uint256) public tokenIdOf;
    mapping(uint256 => Attrs) private _attrs;

    event Attested(address indexed holder, uint256 indexed tokenId);

    constructor(address initialOwner) ERC721("Tessera ID", "TID") Ownable(initialOwner) {}

    /// @notice Owner attests to an institution's encrypted KYB profile and mints their soulbound NFT.
    function attest(
        address holder,
        externalEuint8 inputTier,
        bytes calldata tierProof,
        externalEuint16 inputJurisdiction,
        bytes calldata jurisdictionProof,
        externalEuint8 inputAumBracket,
        bytes calldata aumProof
    ) external onlyOwner returns (uint256 tokenId) {
        if (tokenIdOf[holder] != 0) revert AlreadyAttested(holder);

        euint8 tier = FHE.fromExternal(inputTier, tierProof);
        euint16 jurisdiction = FHE.fromExternal(inputJurisdiction, jurisdictionProof);
        euint8 aumBracket = FHE.fromExternal(inputAumBracket, aumProof);

        tokenId = _nextId++;
        tokenIdOf[holder] = tokenId;
        _attrs[tokenId] = Attrs(tier, jurisdiction, aumBracket);

        FHE.allowThis(tier);
        FHE.allowThis(jurisdiction);
        FHE.allowThis(aumBracket);
        FHE.allow(tier, holder);
        FHE.allow(jurisdiction, holder);
        FHE.allow(aumBracket, holder);

        _safeMint(holder, tokenId);
        emit Attested(holder, tokenId);
    }

    function tierOf(address holder) external view returns (euint8) {
        return _attrs[tokenIdOf[holder]].tier;
    }

    function jurisdictionOf(address holder) external view returns (euint16) {
        return _attrs[tokenIdOf[holder]].jurisdiction;
    }

    function aumBracketOf(address holder) external view returns (euint8) {
        return _attrs[tokenIdOf[holder]].aumBracket;
    }

    /// @notice Grant a third party (e.g. ComplianceOracle) read access to this institution's attrs.
    function shareAttrsWith(address reader) external {
        uint256 tokenId = tokenIdOf[msg.sender];
        require(tokenId != 0, "no token");
        Attrs storage a = _attrs[tokenId];
        FHE.allow(a.tier, reader);
        FHE.allow(a.jurisdiction, reader);
        FHE.allow(a.aumBracket, reader);
    }

    /// @notice Soulbound: only mint allowed.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
```

- [ ] **Step 3.2: Add `@openzeppelin/contracts` (non-confidential) since we need ERC721/Ownable**

```bash
npm --workspace contracts install @openzeppelin/contracts
```

- [ ] **Step 3.3: Compile to verify the file is syntactically valid**

```bash
npm --workspace contracts run compile
```

Expected: PASS, no errors.

- [ ] **Step 3.4: Commit**

```bash
git add contracts/contracts/TesseraID.sol contracts/package.json contracts/package-lock.json
git commit -m "feat(contracts): TesseraID soulbound NFT with encrypted KYB attrs"
```

---

## Task 4: TesseraID tests

**Files:**
- Create: `contracts/test/TesseraID.ts`

The `@fhevm/hardhat-plugin` exposes a `fhevm` global on the Hardhat Runtime Environment for creating mock encrypted inputs and decrypting outputs in tests.

- [ ] **Step 4.1: Write the failing test**

```typescript
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { TesseraID } from "../types";

describe("TesseraID", function () {
  let tesseraID: TesseraID;
  let owner: any;
  let alice: any;
  let bob: any;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TesseraID");
    tesseraID = (await Factory.connect(owner).deploy(owner.address)) as unknown as TesseraID;
    await tesseraID.waitForDeployment();
  });

  async function attestAlice(tier = 1, jurisdiction = 826 /* GB */, aum = 3) {
    const addr = await tesseraID.getAddress();
    const buf = fhevm.createEncryptedInput(addr, owner.address);
    buf.add8(tier).add16(jurisdiction).add8(aum);
    const enc = await buf.encrypt();
    return tesseraID
      .connect(owner)
      .attest(
        alice.address,
        enc.handles[0],
        enc.inputProof,
        enc.handles[1],
        enc.inputProof,
        enc.handles[2],
        enc.inputProof,
      );
  }

  it("mints a token to the holder on attest", async () => {
    await expect(attestAlice()).to.emit(tesseraID, "Attested").withArgs(alice.address, 1);
    expect(await tesseraID.tokenIdOf(alice.address)).to.equal(1);
    expect(await tesseraID.ownerOf(1)).to.equal(alice.address);
  });

  it("rejects double-attestation for the same holder", async () => {
    await attestAlice();
    await expect(attestAlice()).to.be.revertedWithCustomError(tesseraID, "AlreadyAttested");
  });

  it("only owner can attest", async () => {
    const addr = await tesseraID.getAddress();
    const buf = fhevm.createEncryptedInput(addr, alice.address);
    buf.add8(1).add16(826).add8(3);
    const enc = await buf.encrypt();
    await expect(
      tesseraID
        .connect(alice)
        .attest(
          alice.address,
          enc.handles[0],
          enc.inputProof,
          enc.handles[1],
          enc.inputProof,
          enc.handles[2],
          enc.inputProof,
        ),
    ).to.be.revertedWithCustomError(tesseraID, "OwnableUnauthorizedAccount");
  });

  it("is soulbound — transfers revert", async () => {
    await attestAlice();
    await expect(
      tesseraID.connect(alice).transferFrom(alice.address, bob.address, 1),
    ).to.be.revertedWithCustomError(tesseraID, "Soulbound");
  });

  it("holder can decrypt their own tier", async () => {
    await attestAlice(2);
    const handle = await tesseraID.tierOf(alice.address);
    const clear = await fhevm.userDecryptEuint(
      fhevm.FhevmType.euint8,
      handle,
      await tesseraID.getAddress(),
      alice,
    );
    expect(clear).to.equal(2n);
  });
});
```

- [ ] **Step 4.2: Run tests**

```bash
npm --workspace contracts run test -- --grep TesseraID
```

Expected: 5 passing.

- [ ] **Step 4.3: Commit**

```bash
git add contracts/test/TesseraID.ts
git commit -m "test(contracts): TesseraID attest + soulbound + decrypt"
```

---

## Task 5: ConfidentialTBill.sol

**Files:**
- Create: `contracts/contracts/ConfidentialTBill.sol`

- [ ] **Step 5.1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConfidentialTBill — mock tokenized US Treasury Bill (ERC-7984)
contract ConfidentialTBill is ERC7984, Ownable, ZamaEthereumConfig {
    constructor(address initialOwner)
        ERC7984("Tessera Confidential T-Bill", "cTBILL", "")
        Ownable(initialOwner)
    {}

    /// @notice Owner-gated mint of an encrypted amount to `to`.
    function mintEncrypted(address to, externalEuint64 inputAmount, bytes calldata proof)
        external
        onlyOwner
        returns (euint64 minted)
    {
        euint64 amount = FHE.fromExternal(inputAmount, proof);
        _mint(to, amount);
        return amount;
    }
}
```

- [ ] **Step 5.2: Compile**

```bash
npm --workspace contracts run compile
```

Expected: PASS.

- [ ] **Step 5.3: Commit**

```bash
git add contracts/contracts/ConfidentialTBill.sol
git commit -m "feat(contracts): ConfidentialTBill ERC-7984 mock"
```

---

## Task 6: ConfidentialUSDC.sol

**Files:**
- Create: `contracts/contracts/ConfidentialUSDC.sol`

- [ ] **Step 6.1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConfidentialUSDC — mock confidential USDC (ERC-7984)
contract ConfidentialUSDC is ERC7984, Ownable, ZamaEthereumConfig {
    constructor(address initialOwner)
        ERC7984("Tessera Confidential USDC", "cUSDC", "")
        Ownable(initialOwner)
    {}

    function mintEncrypted(address to, externalEuint64 inputAmount, bytes calldata proof)
        external
        onlyOwner
        returns (euint64 minted)
    {
        euint64 amount = FHE.fromExternal(inputAmount, proof);
        _mint(to, amount);
        return amount;
    }
}
```

- [ ] **Step 6.2: Compile**

```bash
npm --workspace contracts run compile
```

- [ ] **Step 6.3: Commit**

```bash
git add contracts/contracts/ConfidentialUSDC.sol
git commit -m "feat(contracts): ConfidentialUSDC ERC-7984 mock"
```

---

## Task 7: Token tests (TBill + USDC)

**Files:**
- Create: `contracts/test/ConfidentialTBill.ts`
- Create: `contracts/test/ConfidentialUSDC.ts`

- [ ] **Step 7.1: Write TBill tests**

```typescript
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ConfidentialTBill } from "../types";

describe("ConfidentialTBill", function () {
  let tbill: ConfidentialTBill;
  let owner: any;
  let alice: any;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ConfidentialTBill");
    tbill = (await Factory.connect(owner).deploy(owner.address)) as unknown as ConfidentialTBill;
    await tbill.waitForDeployment();
  });

  it("mints an encrypted amount that the recipient can decrypt", async () => {
    const tokenAddr = await tbill.getAddress();
    const buf = fhevm.createEncryptedInput(tokenAddr, owner.address);
    buf.add64(1_000_000n);
    const enc = await buf.encrypt();

    await tbill.connect(owner).mintEncrypted(alice.address, enc.handles[0], enc.inputProof);

    const balanceHandle = await tbill.confidentialBalanceOf(alice.address);
    const clear = await fhevm.userDecryptEuint(
      fhevm.FhevmType.euint64,
      balanceHandle,
      tokenAddr,
      alice,
    );
    expect(clear).to.equal(1_000_000n);
  });

  it("only owner can mint", async () => {
    const tokenAddr = await tbill.getAddress();
    const buf = fhevm.createEncryptedInput(tokenAddr, alice.address);
    buf.add64(1n);
    const enc = await buf.encrypt();
    await expect(
      tbill.connect(alice).mintEncrypted(alice.address, enc.handles[0], enc.inputProof),
    ).to.be.revertedWithCustomError(tbill, "OwnableUnauthorizedAccount");
  });
});
```

- [ ] **Step 7.2: Write USDC tests** (mirror of TBill — same shape, swap contract name).

```typescript
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ConfidentialUSDC } from "../types";

describe("ConfidentialUSDC", function () {
  let usdc: ConfidentialUSDC;
  let owner: any;
  let alice: any;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ConfidentialUSDC");
    usdc = (await Factory.connect(owner).deploy(owner.address)) as unknown as ConfidentialUSDC;
    await usdc.waitForDeployment();
  });

  it("mints an encrypted amount that the recipient can decrypt", async () => {
    const tokenAddr = await usdc.getAddress();
    const buf = fhevm.createEncryptedInput(tokenAddr, owner.address);
    buf.add64(500_000n);
    const enc = await buf.encrypt();

    await usdc.connect(owner).mintEncrypted(alice.address, enc.handles[0], enc.inputProof);

    const balanceHandle = await usdc.confidentialBalanceOf(alice.address);
    const clear = await fhevm.userDecryptEuint(
      fhevm.FhevmType.euint64,
      balanceHandle,
      tokenAddr,
      alice,
    );
    expect(clear).to.equal(500_000n);
  });
});
```

- [ ] **Step 7.3: Run tests**

```bash
npm --workspace contracts run test
```

Expected: all passing.

- [ ] **Step 7.4: Commit**

```bash
git add contracts/test/
git commit -m "test(contracts): TBill and USDC mint + decrypt"
```

---

## Task 8: Deploy scripts (hardhat-deploy)

**Files:**
- Create: `contracts/deploy/01_tessera_id.ts`
- Create: `contracts/deploy/02_tbill.ts`
- Create: `contracts/deploy/03_usdc.ts`

- [ ] **Step 8.1: TesseraID deploy**

```typescript
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const result = await deployments.deploy("TesseraID", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log(`TesseraID deployed at ${result.address}`);
};

func.tags = ["TesseraID"];
export default func;
```

- [ ] **Step 8.2: TBill deploy**

```typescript
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const result = await deployments.deploy("ConfidentialTBill", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log(`ConfidentialTBill deployed at ${result.address}`);
};

func.tags = ["ConfidentialTBill"];
export default func;
```

- [ ] **Step 8.3: USDC deploy** (mirror)

```typescript
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const result = await deployments.deploy("ConfidentialUSDC", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log(`ConfidentialUSDC deployed at ${result.address}`);
};

func.tags = ["ConfidentialUSDC"];
export default func;
```

- [ ] **Step 8.4: Verify deploy works on local hardhat network**

```bash
npm --workspace contracts run deploy:localhost
```

Run inside a separate terminal that has `npx hardhat node` running, OR use the in-process hardhat network with `--network hardhat` (default for hardhat-deploy when no network specified). For now, just run the test suite which exercises deployment paths.

- [ ] **Step 8.5: Commit**

```bash
git add contracts/deploy/
git commit -m "feat(contracts): hardhat-deploy scripts for the three contracts"
```

---

## Task 9: Web workspace bootstrap

**Files:**
- Create: `web/` (via create-next-app)

- [ ] **Step 9.1: Scaffold Next.js app**

```bash
npx create-next-app@latest web --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
```

- [ ] **Step 9.2: Set web package name**

Edit `web/package.json`, set `"name": "@tessera/web"`.

- [ ] **Step 9.3: Verify `web/app/page.tsx` exists**

- [ ] **Step 9.4: Install ethers v6 + Zama relayer SDK + Web3Auth**

```bash
npm --workspace web install ethers@^6.16.0 @zama-fhe/relayer-sdk@^0.4.1 @web3auth/modal@^10
```

- [ ] **Step 9.5: Initialize shadcn**

```bash
cd web && npx shadcn@latest init -d && cd ..
```

The `-d` flag accepts defaults (New York style, neutral palette, CSS variables, RSC).

- [ ] **Step 9.6: Add the shadcn components we need for Week 1**

```bash
cd web && npx shadcn@latest add button card input label select && cd ..
```

- [ ] **Step 9.7: Commit**

```bash
git add web/
git commit -m "chore(web): bootstrap Next.js + Tailwind + shadcn + Web3Auth/relayer SDK"
```

---

## Task 10: Web3Auth provider + login button

**Files:**
- Create: `web/lib/web3auth.ts`
- Create: `web/app/providers.tsx`
- Modify: `web/app/layout.tsx`
- Create: `web/components/login-button.tsx`
- Create: `web/.env.local.example`

- [ ] **Step 10.1: Web3Auth client config**

```typescript
// web/lib/web3auth.ts
"use client";

import { Web3AuthOptions, WEB3AUTH_NETWORK } from "@web3auth/modal";

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";

export const web3AuthOptions: Web3AuthOptions = {
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  ssr: true,
  chains: [
    {
      chainNamespace: "eip155",
      chainId: "0xaa36a7", // Sepolia
      rpcTarget: process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "https://rpc.sepolia.org",
      displayName: "Ethereum Sepolia",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      ticker: "ETH",
      tickerName: "Sepolia ETH",
    },
  ],
};
```

- [ ] **Step 10.2: Provider wrapping app**

```tsx
// web/app/providers.tsx
"use client";

import { Web3AuthProvider } from "@web3auth/modal/react";
import { web3AuthOptions } from "@/lib/web3auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Web3AuthProvider config={{ web3AuthOptions }}>
      {children}
    </Web3AuthProvider>
  );
}
```

- [ ] **Step 10.3: Mount Providers in `web/app/layout.tsx`** — wrap `{children}` with `<Providers>...</Providers>`.

- [ ] **Step 10.4: Login button**

```tsx
// web/components/login-button.tsx
"use client";

import { useWeb3AuthConnect, useWeb3AuthDisconnect } from "@web3auth/modal/react";
import { Button } from "@/components/ui/button";

export function LoginButton() {
  const { connect, isConnected } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();

  if (isConnected) return <Button onClick={() => disconnect()}>Sign out</Button>;
  return <Button onClick={() => connect()}>Sign in</Button>;
}
```

- [ ] **Step 10.5: `.env.local.example`**

```
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=your-web3auth-client-id-from-dashboard.web3auth.io
NEXT_PUBLIC_SEPOLIA_RPC=https://sepolia.infura.io/v3/your-infura-key
NEXT_PUBLIC_TESSERA_ID_ADDRESS=0x...
NEXT_PUBLIC_TBILL_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

- [ ] **Step 10.6: Verify dev server runs**

```bash
npm --workspace web run dev
```

Expected: Next.js starts on :3000 without errors. Stop it with Ctrl-C.

- [ ] **Step 10.7: Commit**

```bash
git add web/
git commit -m "feat(web): Web3Auth Modal v10 provider + login button"
```

---

## Task 11: Web → contracts bridge (`lib/contracts.ts`, `lib/fhe.ts`)

**Files:**
- Create: `web/lib/contracts.ts`
- Create: `web/lib/fhe.ts`
- Create: `web/lib/abi/TesseraID.json` (synced from `contracts/artifacts`)
- Create: `web/lib/abi/ConfidentialTBill.json`
- Create: `web/lib/abi/ConfidentialUSDC.json`
- Create: `contracts/scripts/sync-abis.ts`

- [ ] **Step 11.1: Sync-abis script**

```typescript
// contracts/scripts/sync-abis.ts
import fs from "fs";
import path from "path";

const TARGETS = ["TesseraID", "ConfidentialTBill", "ConfidentialUSDC"];
const outDir = path.resolve(__dirname, "../../web/lib/abi");
fs.mkdirSync(outDir, { recursive: true });

for (const name of TARGETS) {
  const artifactPath = path.resolve(
    __dirname,
    `../artifacts/contracts/${name}.sol/${name}.json`,
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(
    path.join(outDir, `${name}.json`),
    JSON.stringify({ abi: artifact.abi }, null, 2),
  );
  console.log(`synced ${name} ABI`);
}
```

Add to `contracts/package.json` scripts: `"sync-abis": "ts-node scripts/sync-abis.ts"`.

Run after compile:

```bash
npm --workspace contracts run compile
npm --workspace contracts run sync-abis
```

- [ ] **Step 11.2: FHE helper (relayer SDK init)**

```typescript
// web/lib/fhe.ts
"use client";

import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/bundle";

let instancePromise: Promise<Awaited<ReturnType<typeof createInstance>>> | null = null;

export async function getFhe() {
  if (!instancePromise) {
    instancePromise = (async () => {
      await initSDK();
      return createInstance(SepoliaConfig);
    })();
  }
  return instancePromise;
}
```

- [ ] **Step 11.3: Contracts bridge**

```typescript
// web/lib/contracts.ts
"use client";

import { Contract, BrowserProvider } from "ethers";
import TesseraIDArtifact from "@/lib/abi/TesseraID.json";
import TBillArtifact from "@/lib/abi/ConfidentialTBill.json";
import USDCArtifact from "@/lib/abi/ConfidentialUSDC.json";

export const ADDR = {
  tesseraId: process.env.NEXT_PUBLIC_TESSERA_ID_ADDRESS!,
  tbill: process.env.NEXT_PUBLIC_TBILL_ADDRESS!,
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS!,
};

export function getTesseraID(provider: BrowserProvider, signer?: any) {
  return new Contract(ADDR.tesseraId, TesseraIDArtifact.abi, signer ?? provider);
}
export function getTBill(provider: BrowserProvider, signer?: any) {
  return new Contract(ADDR.tbill, TBillArtifact.abi, signer ?? provider);
}
export function getUSDC(provider: BrowserProvider, signer?: any) {
  return new Contract(ADDR.usdc, USDCArtifact.abi, signer ?? provider);
}
```

- [ ] **Step 11.4: Commit**

```bash
git add contracts/scripts/sync-abis.ts contracts/package.json web/lib/
git commit -m "feat: ABI sync script + web contracts/FHE bridge"
```

---

## Task 12: `/onboard` route — KYB form + attest call

**Files:**
- Create: `web/app/onboard/page.tsx`
- Create: `web/app/api/attest/route.ts` (server action that owns the attestation key)

The frontend collects KYB inputs, encrypts them client-side using the relayer SDK, then POSTs the ciphertext handles + proofs to a server route. The server holds the deployer key (server-only env var) and submits `attest()`. This way the user's wallet doesn't need to be the contract owner.

- [ ] **Step 12.1: Server attest route**

```typescript
// web/app/api/attest/route.ts
import { NextResponse } from "next/server";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import TesseraIDArtifact from "@/lib/abi/TesseraID.json";

export async function POST(req: Request) {
  const { holder, tier, tierProof, jurisdiction, jurisdictionProof, aum, aumProof } = await req.json();

  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC!);
  const wallet = new Wallet(process.env.TESSERA_DEPLOYER_PK!, provider);
  const contract = new Contract(process.env.TESSERA_ID_ADDRESS!, TesseraIDArtifact.abi, wallet);

  const tx = await contract.attest(holder, tier, tierProof, jurisdiction, jurisdictionProof, aum, aumProof);
  const receipt = await tx.wait();
  return NextResponse.json({ txHash: receipt.hash });
}
```

- [ ] **Step 12.2: Onboard page**

```tsx
// web/app/onboard/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ADDR } from "@/lib/contracts";
import { getFhe } from "@/lib/fhe";

export default function OnboardPage() {
  const router = useRouter();
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("826");
  const [tier, setTier] = useState("1");
  const [aum, setAum] = useState("3");

  if (!isConnected) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p>Please sign in first.</p>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      if (!provider) throw new Error("no provider");
      const accounts: string[] = await provider.request({ method: "eth_accounts" });
      const holder = accounts[0];

      const fhe = await getFhe();
      const buf = fhe.createEncryptedInput(ADDR.tesseraId, holder);
      buf.add8(Number(tier));
      buf.add16(Number(jurisdiction));
      buf.add8(Number(aum));
      const enc = await buf.encrypt();

      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holder,
          tier: enc.handles[0],
          tierProof: enc.inputProof,
          jurisdiction: enc.handles[1],
          jurisdictionProof: enc.inputProof,
          aum: enc.handles[2],
          aumProof: enc.inputProof,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/dashboard");
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <Card>
        <CardHeader><CardTitle>Mock KYB Attestation</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="name">Legal entity name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Jurisdiction</Label>
              <Select value={jurisdiction} onValueChange={setJurisdiction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="826">United Kingdom</SelectItem>
                  <SelectItem value="840">United States</SelectItem>
                  <SelectItem value="276">Germany</SelectItem>
                  <SelectItem value="702">Singapore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>KYB tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Tier 1 — institutional</SelectItem>
                  <SelectItem value="2">Tier 2 — corporate</SelectItem>
                  <SelectItem value="3">Tier 3 — retail-eligible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>AUM bracket</Label>
              <Select value={aum} onValueChange={setAum}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">&lt; $10M</SelectItem>
                  <SelectItem value="2">$10M – $100M</SelectItem>
                  <SelectItem value="3">$100M – $1B</SelectItem>
                  <SelectItem value="4">$1B – $10B</SelectItem>
                  <SelectItem value="5">$10B+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit attestation"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 12.3: Add server-only env vars to `.env.local.example`**

```
SEPOLIA_RPC=https://sepolia.infura.io/v3/...
TESSERA_DEPLOYER_PK=0x...           # owner key for TesseraID.attest()
TESSERA_ID_ADDRESS=0x...
```

- [ ] **Step 12.4: Commit**

```bash
git add web/app/onboard web/app/api .env.local.example
git commit -m "feat(web): /onboard KYB form + server-side attest route"
```

---

## Task 13: `/dashboard` skeleton — encrypted positions

**Files:**
- Create: `web/app/dashboard/page.tsx`

Reads `confidentialBalanceOf(user)` from cTBILL + cUSDC, attempts user-decryption via the relayer SDK, renders cards. If decryption fails (no ACL grant) shows "🔒 encrypted".

- [ ] **Step 13.1: Dashboard page**

```tsx
// web/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADDR } from "@/lib/contracts";
import { getFhe } from "@/lib/fhe";
import TBillArtifact from "@/lib/abi/ConfidentialTBill.json";
import USDCArtifact from "@/lib/abi/ConfidentialUSDC.json";

type Position = { symbol: string; clear: bigint | null };

export default function Dashboard() {
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    if (!isConnected || !provider) return;
    (async () => {
      const ethers = new BrowserProvider(provider as any);
      const signer = await ethers.getSigner();
      const me = await signer.getAddress();
      const fhe = await getFhe();
      const out: Position[] = [];
      for (const [symbol, address, abi] of [
        ["cTBILL", ADDR.tbill, TBillArtifact.abi] as const,
        ["cUSDC", ADDR.usdc, USDCArtifact.abi] as const,
      ]) {
        const c = new Contract(address, abi, signer);
        const handle: string = await c.confidentialBalanceOf(me);
        let clear: bigint | null = null;
        try {
          clear = await fhe.userDecrypt({ handles: [handle], contractAddress: address }, signer);
        } catch {
          /* no ACL grant yet */
        }
        out.push({ symbol, clear });
      }
      setPositions(out);
    })();
  }, [isConnected, provider]);

  if (!isConnected) return <main className="p-8">Please sign in first.</main>;

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Encrypted positions</h1>
      <div className="grid grid-cols-2 gap-4">
        {positions.map((p) => (
          <Card key={p.symbol}>
            <CardHeader><CardTitle>{p.symbol}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-mono">
                {p.clear === null ? "🔒 encrypted" : p.clear.toString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

> **Note:** The exact `userDecrypt` signature depends on the relayer SDK's current API. If the call shape differs, adjust to match the SDK's published shape — the principle (handle → cleartext via signer) is the contract.

- [ ] **Step 13.2: Verify the dev server still compiles**

```bash
npm --workspace web run dev
```

- [ ] **Step 13.3: Commit**

```bash
git add web/app/dashboard
git commit -m "feat(web): /dashboard encrypted positions skeleton"
```

---

## Task 14: README + final commit

**Files:**
- Modify: `README.md`

- [ ] **Step 14.1: Write the real README**

```markdown
# Tessera

Private settlement for public blockchains. Powered by Zama's FHE.

## Layout

- `contracts/` — Solidity contracts on Zama FHEVM (Sepolia testnet).
- `web/` — Next.js 14 app (institutional dashboard + mobile PWA companion).

## Local setup

```bash
npm install
npm --workspace contracts run compile
npm --workspace contracts run test
```

## Deploy to Sepolia

1. Set Hardhat vars:
   ```bash
   cd contracts
   npx hardhat vars set MNEMONIC
   npx hardhat vars set INFURA_API_KEY
   npx hardhat vars set ETHERSCAN_API_KEY
   ```
2. Deploy:
   ```bash
   npm run deploy:sepolia
   npm run sync-abis  # copies ABIs into web/lib/abi
   ```
3. Copy deployed addresses into `web/.env.local` (see `web/.env.local.example`).

## Run the web app

```bash
cp web/.env.local.example web/.env.local
# fill in NEXT_PUBLIC_WEB3AUTH_CLIENT_ID (https://dashboard.web3auth.io)
# fill in addresses + RPC + server-only TESSERA_DEPLOYER_PK
npm run dev:web
```

Open http://localhost:3000.
```

- [ ] **Step 14.2: Final commit**

```bash
git add README.md
git commit -m "docs: Week 1 setup README"
```

---

## Self-Review Notes

- Spec coverage: §6.1 items 1 (Onboarding/Web3Auth/KYB/TesseraID) and 2-3 (T-Bill + USDC ERC-7984) addressed. Items 4-9 are subsequent plans.
- Soulbound transfer: `_update` revert covers ERC-721 v5 unified transfer path.
- AI compliance, RFQ matching, settlement: out of scope for Plan 1.
- Web3Auth client ID and Sepolia deployer key are externalised — user must supply before live runs. We can scaffold and test without them, since Hardhat tests run against the in-process FHE mock.

## Open items requiring user input before "live" demo

1. Web3Auth client ID (free tier from dashboard.web3auth.io).
2. Infura API key for Sepolia.
3. A funded Sepolia mnemonic for the deployer.

We can complete every task here without those — production wiring deferred to deployment time.
