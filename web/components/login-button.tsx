"use client";

import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
} from "@web3auth/modal/react";

export function LoginButton({ className }: { className?: string }) {
  const { isInitialized } = useWeb3Auth();
  const { connect, isConnected, loading: connecting } = useWeb3AuthConnect();
  const { disconnect, loading: disconnecting } = useWeb3AuthDisconnect();

  const base =
    className ??
    "rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50";

  if (!isInitialized) {
    return (
      <button className={base} disabled>
        Loading…
      </button>
    );
  }

  if (isConnected) {
    return (
      <button className={base} onClick={() => disconnect()} disabled={disconnecting}>
        {disconnecting ? "Signing out…" : "Sign out"}
      </button>
    );
  }

  return (
    <button className={base} onClick={() => connect()} disabled={connecting}>
      {connecting ? "Connecting…" : "Sign in"}
    </button>
  );
}
