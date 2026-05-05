"use client";

import { useState } from "react";
import { txUrl, explorerName } from "@/lib/explorer";

/**
 * Renders a transaction hash. If a block explorer is configured, links out
 * to it; otherwise shows a click-to-copy affordance. Used everywhere we
 * display a tx (activity rows, send/trade success banners, faucet receipts).
 */
export function TxLink({
  hash,
  truncate = 14,
  className = "",
}: {
  hash: string;
  truncate?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!hash) return null;

  const url = txUrl(hash);
  const name = explorerName();
  const short = `${hash.slice(0, truncate)}…${hash.slice(-6)}`;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`num inline-flex items-center gap-1.5 tracking-[0.04em] text-marigold transition-colors hover:text-marigold-deep hover:underline ${className}`}
        title={`View on ${name}`}
      >
        {short}
        <ExternalLink />
      </a>
    );
  }

  // No explorer configured — copy the hash instead.
  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`num inline-flex items-center gap-1.5 tracking-[0.04em] text-paper transition-colors hover:text-marigold ${className}`}
      title="Copy transaction hash"
    >
      {short}
      <span className="text-[9.5px] uppercase tracking-[0.2em] text-paper-faint">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

function ExternalLink() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M5 2H2v8h8V7M7 2h3v3M5 7l5-5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}
