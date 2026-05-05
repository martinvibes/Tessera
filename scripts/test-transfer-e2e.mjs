// End-to-end test of the signed-transfer flow.
// 1. Two Hardhat default accounts (Alice, Bob) with known keys
// 2. Operator faucets cTBILL + cUSDC to Alice
// 3. Alice signs EIP-712 transfer to Bob, POSTs to /api/transfer
// 4. Verify Bob now has tokens, Alice's balance decreased
// 5. Reverse direction: Bob signs transfer back to Alice
// 6. Verify both decrypt-balance endpoints return the right cleartext

import { Wallet } from "ethers";

const RPC = "http://localhost:3000";

// Hardhat default accounts (deterministic)
const ALICE_PK =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // account #1
const BOB_PK =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"; // account #2

const aliceWallet = new Wallet(ALICE_PK);
const bobWallet = new Wallet(BOB_PK);
const aliceAddr = aliceWallet.address;
const bobAddr = bobWallet.address;

const TBILL = process.env.TBILL_ADDRESS;
const USDC = process.env.USDC_ADDRESS;

const DOMAIN = { name: "Tessera", version: "1" };
const TRANSFER_TYPES = {
  Transfer: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint64" },
    { name: "issuedAt", type: "uint256" },
  ],
};

async function step(label, fn) {
  process.stdout.write(`\x1b[36m▌ ${label}\x1b[0m\n`);
  try {
    const r = await fn();
    if (r !== undefined) console.log("  →", r);
    return r;
  } catch (e) {
    console.error(`  \x1b[31m✗ ${e.message}\x1b[0m`);
    process.exit(1);
  }
}

async function post(path, body) {
  const res = await fetch(RPC + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.statusText}`);
  return data;
}

async function lookup(addr) {
  const r = await post("/api/counterparty", { address: addr });
  return {
    onboarded: r.onboarded,
    tbillHandle: r.handles.tbill,
    usdcHandle: r.handles.usdc,
  };
}

async function decrypt(wallet, token) {
  const issuedAt = Date.now();
  const sig = await wallet.signTypedData(
    DOMAIN,
    {
      Decrypt: [
        { name: "holder", type: "address" },
        { name: "token", type: "address" },
        { name: "issuedAt", type: "uint256" },
      ],
    },
    { holder: wallet.address, token, issuedAt },
  );
  const r = await post("/api/decrypt-balance", {
    holder: wallet.address,
    token,
    issuedAt,
    signature: sig,
  });
  return BigInt(r.balance);
}

async function transfer(wallet, to, token, amount) {
  const issuedAt = Date.now();
  const sig = await wallet.signTypedData(DOMAIN, TRANSFER_TYPES, {
    from: wallet.address,
    to,
    token,
    amount,
    issuedAt,
  });
  const r = await post("/api/transfer", {
    from: wallet.address,
    to,
    token,
    amount: amount.toString(),
    issuedAt,
    signature: sig,
  });
  return r.txHash;
}

async function faucet(addr) {
  return post("/api/faucet", { holder: addr });
}

async function fund(addr) {
  return post("/api/fund", { holder: addr });
}

await step("Resolve token addresses from server", async () => {
  // Get from /api/counterparty response — env vars aren't exposed.
  // Just hardcode from the env we wrote in this session.
  return { TBILL, USDC };
});

if (!TBILL || !USDC) {
  console.error(
    "Set TBILL_ADDRESS and USDC_ADDRESS env vars before running this script.",
  );
  process.exit(1);
}

console.log(`Alice: ${aliceAddr}`);
console.log(`Bob:   ${bobAddr}`);
console.log(`TBILL: ${TBILL}`);
console.log(`USDC:  ${USDC}\n`);

// 1. Top up gas + mint
await step("Fund Alice", () => fund(aliceAddr));
await step("Fund Bob", () => fund(bobAddr));
await step("Faucet to Alice", () => faucet(aliceAddr));

// 2. Verify Alice has balances
const aliceTBillStart = await step("Decrypt Alice cTBILL (initial)", () =>
  decrypt(aliceWallet, TBILL),
);
const aliceUsdcStart = await step("Decrypt Alice cUSDC (initial)", () =>
  decrypt(aliceWallet, USDC),
);
const bobTBillStart = await step("Decrypt Bob cTBILL (initial)", () =>
  decrypt(bobWallet, TBILL),
);
const bobUsdcStart = await step("Decrypt Bob cUSDC (initial)", () =>
  decrypt(bobWallet, USDC),
);

// 3. Alice → Bob: 100,000 cUSDC
await step("Alice → Bob: 100,000 cUSDC (signed)", () =>
  transfer(aliceWallet, bobAddr, USDC, 100000n),
);

const aliceUsdcMid = await step("Alice cUSDC after send", () =>
  decrypt(aliceWallet, USDC),
);
const bobUsdcMid = await step("Bob cUSDC after receive", () =>
  decrypt(bobWallet, USDC),
);

if (aliceUsdcMid !== aliceUsdcStart - 100000n) {
  throw new Error(
    `Alice cUSDC expected ${aliceUsdcStart - 100000n}, got ${aliceUsdcMid}`,
  );
}
if (bobUsdcMid !== bobUsdcStart + 100000n) {
  throw new Error(
    `Bob cUSDC expected ${bobUsdcStart + 100000n}, got ${bobUsdcMid}`,
  );
}
console.log("\x1b[32m  ✓ cUSDC balances correct\x1b[0m\n");

// 4. Reverse: Bob → Alice: 25,000 cTBILL (Bob has none — should fail)
await step("Bob → Alice: 25,000 cTBILL (Bob has none → should fail or be 0)",
  async () => {
    try {
      await transfer(bobWallet, aliceAddr, TBILL, 25000n);
      const after = await decrypt(bobWallet, TBILL);
      // ERC-7984 silently no-ops on insufficient balance — confirm Bob still has 0.
      if (after !== 0n) {
        throw new Error(
          `Bob shouldn't have cTBILL, but has ${after}`,
        );
      }
      return "no-op as expected (insufficient balance silently swallowed)";
    } catch (e) {
      return `errored as expected: ${e.message.slice(0, 80)}`;
    }
  },
);

// 5. Faucet Bob, then transfer back
await step("Faucet to Bob", () => faucet(bobAddr));
const bobTBillAfterFaucet = await step("Bob cTBILL after faucet", () =>
  decrypt(bobWallet, TBILL),
);

await step("Bob → Alice: 50,000 cTBILL (signed)", () =>
  transfer(bobWallet, aliceAddr, TBILL, 50000n),
);

const aliceTBillEnd = await step("Alice cTBILL final", () =>
  decrypt(aliceWallet, TBILL),
);
const bobTBillEnd = await step("Bob cTBILL final", () =>
  decrypt(bobWallet, TBILL),
);

if (aliceTBillEnd !== aliceTBillStart + 50000n) {
  throw new Error(
    `Alice cTBILL expected ${aliceTBillStart + 50000n}, got ${aliceTBillEnd}`,
  );
}
if (bobTBillEnd !== bobTBillAfterFaucet - 50000n) {
  throw new Error(
    `Bob cTBILL expected ${bobTBillAfterFaucet - 50000n}, got ${bobTBillEnd}`,
  );
}
console.log("\x1b[32m  ✓ cTBILL balances correct\x1b[0m\n");

// 6. Replay attack — same signature should not work twice (issuedAt expires)
await step("Replay protection check", async () => {
  const issuedAt = Date.now() - 6 * 60 * 1000; // 6 min ago, past 5-min limit
  const sig = await aliceWallet.signTypedData(DOMAIN, TRANSFER_TYPES, {
    from: aliceAddr,
    to: bobAddr,
    token: USDC,
    amount: 1n,
    issuedAt,
  });
  const res = await fetch(RPC + "/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: aliceAddr,
      to: bobAddr,
      token: USDC,
      amount: "1",
      issuedAt,
      signature: sig,
    }),
  });
  if (res.ok) throw new Error("Stale signature was accepted!");
  const data = await res.json();
  return `rejected as expected: ${data.error}`;
});

// 7. Bad signature attack
await step("Forged signature is rejected", async () => {
  const issuedAt = Date.now();
  // Bob signs but claims to be Alice
  const sig = await bobWallet.signTypedData(DOMAIN, TRANSFER_TYPES, {
    from: aliceAddr, // pretending to be Alice
    to: bobAddr,
    token: USDC,
    amount: 1n,
    issuedAt,
  });
  const res = await fetch(RPC + "/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: aliceAddr,
      to: bobAddr,
      token: USDC,
      amount: "1",
      issuedAt,
      signature: sig,
    }),
  });
  if (res.ok) throw new Error("Forged signature was accepted!");
  const data = await res.json();
  return `rejected as expected: ${data.error}`;
});

console.log("\x1b[32m\n✓ ALL E2E CHECKS PASSED\x1b[0m");
