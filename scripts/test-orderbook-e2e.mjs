// End-to-end test: post an OPEN offer to the order book, fetch it, take it
// from a different wallet, verify atomic settlement.
import { Wallet, ZeroAddress } from "ethers";

const RPC = "http://localhost:3000";
const ALICE_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const BOB_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const TBILL = process.env.TBILL_ADDRESS;
const USDC = process.env.USDC_ADDRESS;
if (!TBILL || !USDC) {
  console.error("set TBILL_ADDRESS and USDC_ADDRESS");
  process.exit(1);
}

const alice = new Wallet(ALICE_PK);
const bob = new Wallet(BOB_PK);

const DOMAIN = { name: "Tessera", version: "1" };
const TYPES = {
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
};
const DECRYPT_TYPES = {
  Decrypt: [
    { name: "holder", type: "address" },
    { name: "token", type: "address" },
    { name: "issuedAt", type: "uint256" },
  ],
};

async function step(label, fn) {
  process.stdout.write(`\x1b[36m▌ ${label}\x1b[0m\n`);
  const r = await fn();
  if (r !== undefined) console.log("  →", r);
  return r;
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
async function get(path) {
  const r = await fetch(RPC + path);
  return r.json();
}
async function decrypt(wallet, token) {
  const issuedAt = Date.now();
  const sig = await wallet.signTypedData(DOMAIN, DECRYPT_TYPES, {
    holder: wallet.address,
    token,
    issuedAt,
  });
  const r = await post("/api/decrypt-balance", {
    holder: wallet.address,
    token,
    issuedAt,
    signature: sig,
  });
  return BigInt(r.balance);
}

await step("Fund both", async () => {
  await post("/api/fund", { holder: alice.address });
  await post("/api/fund", { holder: bob.address });
});
await step("Faucet to Alice", () => post("/api/faucet", { holder: alice.address }));
await step("Faucet to Bob", () => post("/api/faucet", { holder: bob.address }));

const aT0 = await step("Alice cTBILL before", () => decrypt(alice, TBILL));
const aU0 = await step("Alice cUSDC  before", () => decrypt(alice, USDC));
const bT0 = await step("Bob   cTBILL before", () => decrypt(bob, TBILL));
const bU0 = await step("Bob   cUSDC  before", () => decrypt(bob, USDC));

// --- Alice posts an open offer ---
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const nonce = BigInt(Date.now() * 1000);
const sellAmt = 75_000n;
const buyAmt = 74_850n;

const openTerms = {
  seller: alice.address,
  buyer: ZeroAddress,
  sellAsset: TBILL,
  buyAsset: USDC,
  sellAmount: sellAmt.toString(),
  buyAmount: buyAmt.toString(),
  nonce: nonce.toString(),
  deadline: deadline.toString(),
};

const sellerSig = await alice.signTypedData(DOMAIN, TYPES, {
  ...openTerms,
  sellAmount: sellAmt,
  buyAmount: buyAmt,
  nonce,
  deadline,
});

const posted = await step("Post open offer to /api/orderbook", () =>
  post("/api/orderbook", { terms: openTerms, sellerSig }),
);

const list = await step("GET /api/orderbook", async () => {
  const r = await get("/api/orderbook");
  return `${r.offers.length} offer(s) live`;
});

if (!list?.includes("offer")) throw new Error("Order book lookup failed");

// --- Bob takes the open offer ---
const takerSig = await bob.signTypedData(DOMAIN, TYPES, {
  seller: alice.address,
  buyer: bob.address,
  sellAsset: TBILL,
  buyAsset: USDC,
  sellAmount: sellAmt,
  buyAmount: buyAmt,
  nonce,
  deadline,
});

await step("Bob takes the open offer (signs as buyer)", () =>
  post("/api/orderbook/accept", {
    offerId: posted.id,
    taker: bob.address,
    takerSig,
  }),
);

const aT1 = await step("Alice cTBILL after", () => decrypt(alice, TBILL));
const aU1 = await step("Alice cUSDC  after", () => decrypt(alice, USDC));
const bT1 = await step("Bob   cTBILL after", () => decrypt(bob, TBILL));
const bU1 = await step("Bob   cUSDC  after", () => decrypt(bob, USDC));

const expect = (label, got, want) => {
  if (got !== want) throw new Error(`${label}: ${got} !== ${want}`);
  console.log(`\x1b[32m  ✓ ${label} ${got}\x1b[0m`);
};
expect("Alice cTBILL", aT1, aT0 - sellAmt);
expect("Bob   cTBILL", bT1, bT0 + sellAmt);
expect("Alice cUSDC ", aU1, aU0 + buyAmt);
expect("Bob   cUSDC ", bU1, bU0 - buyAmt);

// --- Cannot take an already-settled offer ---
await step("Replay rejected (offer status = settled)", async () => {
  const res = await fetch(RPC + "/api/orderbook/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId: posted.id, taker: bob.address, takerSig }),
  });
  if (res.ok) throw new Error("Replay accepted!");
  const d = await res.json();
  return `rejected: ${d.error.slice(0, 80)}`;
});

// --- Self-take rejected ---
await step("Seller cannot take own open offer", async () => {
  const deadline2 = BigInt(Math.floor(Date.now() / 1000) + 600);
  const nonce2 = BigInt(Date.now() * 1000 + 1);
  const sig = await alice.signTypedData(DOMAIN, TYPES, {
    seller: alice.address,
    buyer: ZeroAddress,
    sellAsset: TBILL,
    buyAsset: USDC,
    sellAmount: 1000n,
    buyAmount: 1000n,
    nonce: nonce2,
    deadline: deadline2,
  });
  const p = await post("/api/orderbook", {
    terms: {
      seller: alice.address,
      buyer: ZeroAddress,
      sellAsset: TBILL,
      buyAsset: USDC,
      sellAmount: "1000",
      buyAmount: "1000",
      nonce: nonce2.toString(),
      deadline: deadline2.toString(),
    },
    sellerSig: sig,
  });
  // Alice tries to take her own
  const selfSig = await alice.signTypedData(DOMAIN, TYPES, {
    seller: alice.address,
    buyer: alice.address,
    sellAsset: TBILL,
    buyAsset: USDC,
    sellAmount: 1000n,
    buyAmount: 1000n,
    nonce: nonce2,
    deadline: deadline2,
  });
  const res = await fetch(RPC + "/api/orderbook/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId: p.id, taker: alice.address, takerSig: selfSig }),
  });
  if (res.ok) throw new Error("Self-take accepted!");
  const d = await res.json();
  return `rejected: ${d.error}`;
});

console.log("\n\x1b[32m✓ ORDER BOOK E2E PASSED\x1b[0m");
