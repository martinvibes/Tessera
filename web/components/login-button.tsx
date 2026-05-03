"use client";

import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
  useWeb3AuthUser,
} from "@web3auth/modal/react";
import { motion } from "motion/react";

export function LoginButton() {
  const { isInitialized } = useWeb3Auth();
  const { connect, isConnected, loading: connecting } = useWeb3AuthConnect();
  const { disconnect, loading: disconnecting } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();

  if (!isInitialized) {
    return (
      <button
        disabled
        className="num inline-flex items-center gap-2 rounded-none border border-rule px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-paper-faint"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-paper-faint" />
        Initializing
      </button>
    );
  }

  if (isConnected) {
    const name = (userInfo?.name as string | undefined) ?? "Signed in";
    const initials = (name.match(/\b\w/g) ?? ["·"]).slice(0, 2).join("").toUpperCase();
    return (
      <motion.button
        layout
        onClick={() => disconnect()}
        disabled={disconnecting}
        className="group inline-flex items-center gap-2.5 rounded-none border border-rule bg-ink-2/60 py-1.5 pl-1.5 pr-3 text-[12px] tracking-tight text-paper transition-colors hover:border-paper-faint"
      >
        <span className="num grid h-7 w-7 place-items-center rounded-full bg-marigold text-[10px] font-medium text-ink">
          {initials}
        </span>
        <span className="hidden sm:inline">{disconnecting ? "Signing out…" : name.split(" ")[0]}</span>
        <span className="num hidden text-[10px] uppercase tracking-[0.22em] text-paper-faint sm:inline">
          · sign out
        </span>
      </motion.button>
    );
  }

  return (
    <button
      onClick={() => connect()}
      disabled={connecting}
      className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
    >
      {connecting ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
          Connecting
        </>
      ) : (
        <>
          Sign in
          <Arrow />
        </>
      )}
    </button>
  );
}

function Arrow() {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
      <path
        d="M1 4h9.5M7 1l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
