# Tessera

> Private settlement for public blockchains. Powered by Zama FHE.

Tessera is a private settlement layer where institutions swap tokenized real-world
assets on a public blockchain — instantly, atomically, and with amounts/identities/
balances encrypted. An AI Compliance Copilot runs sanctions, exposure, and KYB checks
on the encrypted data before each trade settles.

This repo is a Next.js + Hardhat npm-workspaces monorepo. See `docs/superpowers/plans/`
for the implementation plans.

## Layout

```
contracts/   Solidity on Zama FHEVM (Sepolia testnet)
web/         Next.js 16 app (institutional dashboard + mobile PWA companion)
docs/        Design + implementation plans
```

## Week 1 status

✅ Soulbound `TesseraID` ERC-721 with FHE-encrypted KYB attributes
✅ `ConfidentialTBill` and `ConfidentialUSDC` (ERC-7984) with owner-gated mint
✅ 13 contract tests passing under `@fhevm/hardhat-plugin`
✅ Web3Auth Modal v10 sign-in
✅ `/onboard` mock-KYB form that encrypts attributes client-side
✅ Server-side `/api/attest` route that mints the soulbound NFT
✅ `/dashboard` skeleton showing encrypted balance handles

## Quick start (local, no testnet)

```bash
npm install
npm run build:contracts
npm run test:contracts
```

Tests run end-to-end against the in-process FHE mock. No testnet credentials required.

## Deploy contracts to Zama FHEVM Sepolia

You need a Sepolia mnemonic with some test ETH and an Infura API key.

```bash
cd contracts
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npx hardhat vars set ETHERSCAN_API_KEY      # optional, for verification

npm run deploy:sepolia
npm run sync-abis        # copies ABIs into web/lib/abi/
```

The deployed addresses print to stdout and are persisted under
`contracts/deployments/sepolia/`.

## Run the web app

```bash
cp web/.env.local.example web/.env.local
# 1. Get a Web3Auth client ID at https://dashboard.web3auth.io
# 2. Paste it as NEXT_PUBLIC_WEB3AUTH_CLIENT_ID
# 3. Paste deployed contract addresses (NEXT_PUBLIC_TESSERA_ID_ADDRESS, etc.)
# 4. For server-side attestation, paste the deployer key as TESSERA_DEPLOYER_PK
npm run dev:web
```

Open http://localhost:3000.

## Personas (per design spec)

- **Maria** — Treasurer at "Acme Capital" ($500M fund)
- **David** — Treasurer at "Bravo Wealth" (B2B2C tokenized treasuries fintech)
- **Eli** — Auditor at "Pearl & Pinnacle" (Big-4)
- **Rita** — Regulator at "FINREG-EU"

For Week 1 only the institution flow (Maria, David) is wired up. Eli and Rita
portals come in Plan 4 (Week 4).

## What's next

- **Plan 2 (Week 2):** `RFQBook.sol` + `Settlement.sol` — encrypted RFQ board, FHE
  matcher, atomic delivery-vs-payment.
- **Plan 3 (Week 3):** AI Compliance Copilot via the Anthropic SDK, Option-3
  commitments + category metadata, `ComplianceOracle.sol` gating settlement.
- **Plan 4 (Week 4):** Auditor + Regulator portals, Selective Disclosure Receipts.
- **Plan 5 (Week 5):** Mobile PWA companion + push notifications + demo polish.
