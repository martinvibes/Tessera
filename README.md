# Tessera

> Private settlement for public blockchains. Powered by Zama FHE.

Tessera is a private settlement layer where institutions swap tokenized real-world assets on a public blockchain — instantly, atomically, and with amounts/identities/balances encrypted. An AI Compliance Copilot runs sanctions, exposure, and KYB checks on the encrypted data before each trade settles.

This repo is a Next.js + Hardhat monorepo. See `docs/superpowers/plans/` for the implementation plans.

## Layout

- `contracts/` — Solidity contracts on Zama FHEVM (Sepolia testnet)
- `web/` — Next.js 14 app (institutional dashboard + mobile PWA companion)
- `docs/` — design + implementation plans

## Quick start

```bash
npm install
npm run build:contracts
npm run test:contracts
npm run dev:web
```

See [Week 1 plan](docs/superpowers/plans/2026-05-02-week-1-scaffold-and-identity.md) for full setup.
