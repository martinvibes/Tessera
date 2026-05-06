/**
 * Offer encoding helpers — keeps offer payloads stateless. The maker signs the
 * `DvP` typed-data, the offer (terms + sig) is base64url-encoded into a URL,
 * the taker decodes and signs the same terms, and the server submits both
 * sigs to {Settlement.settleAtomic}.
 */

export type OfferTerms = {
  seller: string;
  buyer: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string; // bigint as decimal string
  buyAmount: string;
  nonce: string;
  deadline: string; // unix seconds
};

export type SignedOffer = {
  terms: OfferTerms;
  sellerSig: string;
};

/**
 * Chain-independent EIP-712 minimal domain. Must match the `DOMAIN_HASH`
 * constant in Settlement.sol. Omitting chainId / verifyingContract makes the
 * signature work across any chain — required because Web3Auth's MPC wallet
 * sometimes refuses to sign typed data with a chainId that differs from the
 * wallet's bound network.
 */
export const DvP_DOMAIN = () => ({
  name: "Tessera",
  version: "1",
});

export const DvP_TYPES = {
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

export function termsValueForSigning(t: OfferTerms) {
  return {
    seller: t.seller,
    buyer: t.buyer,
    sellAsset: t.sellAsset,
    buyAsset: t.buyAsset,
    sellAmount: BigInt(t.sellAmount),
    buyAmount: BigInt(t.buyAmount),
    nonce: BigInt(t.nonce),
    deadline: BigInt(t.deadline),
  };
}

export function encodeSignedOffer(o: SignedOffer): string {
  const json = JSON.stringify(o);
  if (typeof window === "undefined") {
    return Buffer.from(json, "utf8").toString("base64url");
  }
  // Browser: encode UTF-8 → bytes → base64 → url-safe
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSignedOffer(encoded: string): SignedOffer {
  let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to multiple of 4
  while (b64.length % 4 !== 0) b64 += "=";
  let json: string;
  if (typeof window === "undefined") {
    json = Buffer.from(b64, "base64").toString("utf8");
  } else {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    json = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(json) as SignedOffer;
  return parsed;
}

/** Token symbol from address (case-insensitive). */
export function symbolForAsset(addr: string): "cTBILL" | "cUSDC" | null {
  const tbill = (process.env.NEXT_PUBLIC_TBILL_ADDRESS ?? "").toLowerCase();
  const usdc = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "").toLowerCase();
  const a = addr.toLowerCase();
  if (a === tbill) return "cTBILL";
  if (a === usdc) return "cUSDC";
  return null;
}
