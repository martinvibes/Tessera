"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrowserProvider } from "ethers";
import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
  useWeb3AuthUser,
} from "@web3auth/modal/react";
import { Modal } from "@/components/modal";

export function LoginButton() {
  const { isInitialized, provider } = useWeb3Auth();
  const { connect, isConnected, loading: connecting } = useWeb3AuthConnect();
  const { disconnect, loading: disconnecting } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Resolve wallet address when connected
  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !provider) {
      setAddress(null);
      return;
    }
    (async () => {
      try {
        const eth = new BrowserProvider(provider as never);
        const signer = await eth.getSigner();
        const a = await signer.getAddress();
        if (!cancelled) setAddress(a);
      } catch {
        if (!cancelled) setAddress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, provider]);

  function handleSignOutRequest() {
    setMenuOpen(false);
    setConfirmOpen(true);
  }

  async function confirmSignOut() {
    setConfirmOpen(false);
    await disconnect();
  }

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

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

  if (!isConnected) {
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

  const name = (userInfo?.name as string | undefined) ?? "Signed in";
  const email = userInfo?.email as string | undefined;
  const initials = (name.match(/\b\w/g) ?? ["·"]).slice(0, 2).join("").toUpperCase();
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="group inline-flex items-center gap-2.5 rounded-none border border-rule bg-ink-2/60 py-1.5 pl-1.5 pr-3 text-[12px] tracking-tight text-paper transition-colors hover:border-paper-faint"
      >
        <span className="num grid h-7 w-7 place-items-center rounded-full bg-marigold text-[10px] font-medium text-ink">
          {initials}
        </span>
        <span className="hidden sm:inline">{name.split(" ")[0]}</span>
        <Caret open={menuOpen} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-[calc(100%+8px)] w-[300px] origin-top-right border border-rule bg-ink-2 shadow-2xl"
          >
            {/* identity header */}
            <div className="border-b border-rule p-4">
              <div className="flex items-center gap-3">
                <span className="num grid h-9 w-9 place-items-center rounded-full bg-marigold text-[11px] font-medium text-ink">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-light text-paper">
                    {name}
                  </p>
                  {email && (
                    <p className="num truncate text-[10.5px] tracking-tight text-paper-faint">
                      {email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* address row */}
            <div className="border-b border-rule px-4 py-3">
              <p className="num text-[9.5px] uppercase tracking-[0.24em] text-paper-faint">
                Wallet
              </p>
              <button
                onClick={copyAddress}
                className="mt-1 flex w-full items-center justify-between gap-3 text-left"
                aria-label="Copy wallet address"
              >
                <span className="num truncate text-[12px] text-paper">{shortAddr}</span>
                <span className="num inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-paper-faint transition-colors hover:text-paper">
                  {copied ? (
                    <>
                      <Check /> copied
                    </>
                  ) : (
                    <>
                      <Copy /> copy
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* actions */}
            <ul className="p-2">
              <li>
                <button
                  onClick={handleSignOutRequest}
                  className="num flex w-full items-center justify-between gap-2 px-3 py-2.5 text-[12px] uppercase tracking-[0.18em] text-crimson transition-colors hover:bg-crimson/10"
                >
                  <span>Sign out</span>
                  <Arrow />
                </button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        labelledBy="signout-title"
      >
        <div className="border-b border-rule px-6 py-4">
          <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
            Confirm sign-out
          </p>
        </div>
        <div className="px-6 pt-6 pb-4">
          <h3
            id="signout-title"
            className="font-display text-[26px] font-light leading-tight tracking-[-0.01em] text-paper"
          >
            Sign out of Tessera?
          </h3>
          <p className="mt-3 text-[14px] leading-snug text-paper-dim">
            You&apos;ll need to reconnect via Web3Auth to view encrypted
            positions, sign attestations, or settle trades. Any unsigned drafts
            in this session will be discarded.
          </p>
          {address && (
            <p className="num mt-4 inline-flex items-center gap-2 border border-rule px-3 py-1.5 text-[11px] tracking-tight text-paper-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              {shortAddr}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
          <button
            onClick={() => setConfirmOpen(false)}
            className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper"
            autoFocus
          >
            Cancel
          </button>
          <button
            onClick={confirmSignOut}
            disabled={disconnecting}
            className="num inline-flex items-center gap-2 rounded-none border border-crimson bg-crimson px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {disconnecting ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-paper" />
                Signing out
              </>
            ) : (
              <>
                Sign out
                <Arrow />
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ───── icons ───── */

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

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="6"
      viewBox="0 0 9 6"
      fill="none"
      aria-hidden
      className={`text-paper-faint transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
    </svg>
  );
}

function Copy() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="2" y="2" width="6" height="7" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 2V0.5h6v7H8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M1 4.5L4 7.5 10 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}
