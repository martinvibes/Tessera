"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useWeb3AuthConnect } from "@web3auth/modal/react";

export default function Home() {
  const reduce = useReducedMotion();
  const { isConnected } = useWeb3AuthConnect();

  return (
    <div className="relative">
      {/* Tessellation field + grain */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[820px]">
        <div className="absolute inset-0 tessellation opacity-60" />
        <div className="grain absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink" />
      </div>

      {/* HERO */}
      <section className="relative mx-auto w-full max-w-[1320px] px-6 pt-20 pb-32 md:px-10 md:pt-32">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          {/* Eyebrow + serial */}
          <div className="col-span-12 flex items-center gap-4 md:col-span-8">
            <span className="num text-[11px] uppercase tracking-[0.36em] text-marigold">
              № 001 · Spring 2026
            </span>
            <span className="h-px flex-1 bg-rule" />
            <span className="num text-[11px] uppercase tracking-[0.28em] text-paper-faint">
              Builder Track · Zama Developer Program
            </span>
          </div>

          {/* Headline */}
          <h1 className="col-span-12 font-display text-[clamp(56px,9vw,138px)] font-light leading-[0.94] tracking-[-0.02em] text-paper">
            <Reveal delay={reduce ? 0 : 0.08}>Private settlement</Reveal>
            <Reveal delay={reduce ? 0 : 0.22}>
              <span className="text-paper-faint">for </span>
              <em className="font-medium italic text-marigold">public</em>
              <span className="text-paper-faint"> blockchains.</span>
            </Reveal>
          </h1>

          {/* Subhead */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.6, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-12 max-w-[560px] text-[17px] leading-[1.55] text-paper-dim md:col-span-7"
          >
            Tessera is the institutional rail for on-chain settlement of tokenized
            real-world assets. Encrypted balances, atomic delivery-versus-payment,
            and an AI compliance copilot that never sees plaintext.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.78, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-12 flex flex-wrap items-center gap-4 pt-4"
          >
            <Link
              href={isConnected ? "/onboard" : "/onboard"}
              className="group relative inline-flex items-center gap-3 rounded-none border border-marigold bg-marigold px-7 py-3.5 text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
            >
              {isConnected ? "Begin onboarding" : "Open the rail"}
              <Arrow />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-3 px-2 py-3.5 text-[13px] font-medium uppercase tracking-[0.18em] text-paper-dim transition-colors hover:text-paper"
            >
              <span className="border-b border-rule-2 pb-1 group-hover:border-paper">
                View dashboard
              </span>
              <Arrow />
            </Link>
          </motion.div>

          {/* Side rail */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduce ? 0 : 0.95, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="hidden md:col-span-4 md:col-start-9 md:row-start-3 md:flex md:flex-col md:items-end md:justify-end md:gap-3 md:pr-2"
          >
            <Quote
              line="Bloomberg × Stripe — but private,"
              line2="atomic, and on-chain."
            />
          </motion.aside>
        </div>
      </section>

      {/* Live status / encrypted band */}
      <Band />

      {/* Three editorial panels */}
      <Panels />

      {/* Demo storyboard */}
      <Storyboard />

      {/* Closing — institutional manifesto */}
      <Manifesto />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <span className="block overflow-hidden">
      <motion.span
        initial={{ y: "110%" }}
        animate={{ y: 0 }}
        transition={{ delay, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="block"
      >
        {children}
      </motion.span>
    </span>
  );
}

function Arrow() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
      <path
        d="M1 5h11.5M8 1l4.5 4L8 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

function Quote({ line, line2 }: { line: string; line2: string }) {
  return (
    <figure className="max-w-[260px] border-r-2 border-marigold pr-5 text-right">
      <p className="font-display text-[19px] font-light italic leading-snug text-paper">
        &ldquo;{line}
        <br />
        {line2}&rdquo;
      </p>
      <figcaption className="num mt-3 text-[10px] uppercase tracking-[0.3em] text-paper-faint">
        — Mental model
      </figcaption>
    </figure>
  );
}

function Band() {
  const items = [
    ["AES-equivalent", "FHE confidentiality"],
    ["1 block", "Atomic settlement"],
    ["ERC-7984", "Confidential token standard"],
    ["Sepolia", "Live testnet"],
    ["Option 3", "AI on commitments"],
  ];
  return (
    <section className="border-y border-rule bg-ink-2/40">
      <div className="mx-auto grid max-w-[1320px] grid-cols-2 divide-rule px-6 py-8 md:grid-cols-5 md:divide-x md:px-10">
        {items.map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.06, duration: 0.55 }}
            className="px-4 py-2 first:pl-0 md:py-0"
          >
            <p className="font-display text-[22px] font-light leading-tight text-paper">
              {k}
            </p>
            <p className="num mt-1 text-[10px] uppercase tracking-[0.24em] text-paper-faint">
              {v}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Panels() {
  const panels = [
    {
      idx: "I",
      tag: "Confidential tokens",
      title: "Encrypted balances at the protocol layer.",
      body: "ERC-7984 stores every balance, every transfer amount, every approval as ciphertext on Zama&apos;s FHEVM. Etherscan shows a transfer. Nothing else.",
      span: "md:col-span-7",
    },
    {
      idx: "II",
      tag: "Atomic DvP",
      title: "Two legs. One block.",
      body: "Settlement.sol moves the asset and the payment in a single transaction. Either both succeed or neither. T+0, no central counterparty.",
      span: "md:col-span-5",
    },
    {
      idx: "III",
      tag: "Compliance Copilot",
      title: "An AI that never sees plaintext.",
      body: "The model reasons over commitments and category metadata — &lsquo;Tier-1 EU institution, ticket bracket $1–5M, asset class T-Bill&rsquo; — then signs an attestation. Settlement gates on the signature.",
      span: "md:col-span-12",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1320px] px-6 py-32 md:px-10">
      <header className="mb-14 grid grid-cols-12 items-end gap-6">
        <h2 className="col-span-12 font-display text-[clamp(36px,5vw,68px)] font-light leading-[1] tracking-[-0.02em] text-paper md:col-span-8">
          Three load-bearing
          <br />
          <span className="italic text-paper-dim">primitives.</span>
        </h2>
        <p className="num col-span-12 text-right text-[11px] uppercase tracking-[0.28em] text-paper-faint md:col-span-4">
          § Architecture · 8.1
        </p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {panels.map((p, i) => (
          <motion.article
            key={p.idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className={`group relative col-span-12 border border-rule bg-ink-2/40 p-7 transition-colors hover:bg-ink-3/60 md:p-9 ${p.span}`}
          >
            <div className="flex items-baseline justify-between border-b border-rule pb-4">
              <span className="font-display text-[36px] font-light italic text-marigold">
                {p.idx}
              </span>
              <span className="num text-[10px] uppercase tracking-[0.28em] text-paper-faint">
                {p.tag}
              </span>
            </div>
            <h3 className="mt-6 max-w-[480px] font-display text-[26px] font-light leading-[1.15] tracking-[-0.01em] text-paper md:text-[30px]">
              {p.title}
            </h3>
            <p
              className="mt-5 max-w-[520px] text-[14.5px] leading-[1.65] text-paper-dim"
              dangerouslySetInnerHTML={{ __html: p.body }}
            />
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function Storyboard() {
  const beats = [
    { t: "0:00", who: "Maria · Acme Capital", act: "Opens dashboard. Etherscan shows zero plaintext." },
    { t: "0:15", who: "Maria", act: "Sells $1M T-Bills, min 99.85. Encrypted RFQ submitted." },
    { t: "0:25", who: "Copilot", act: "Matches with David at Bravo. Signs compliance verdict." },
    { t: "0:40", who: "Maria · Mobile", act: "Push notification → biometric approve. $1M settles in one block." },
    { t: "0:55", who: "Eli · Auditor", act: "&ldquo;Show me Acme&apos;s trades over $500K this week.&rdquo; Selective decrypt." },
    { t: "1:10", who: "Rita · Regulator", act: "&ldquo;Any trades involving sanctioned entities?&rdquo; FHE check, returns none." },
  ];

  return (
    <section className="border-t border-rule bg-ink-2/30">
      <div className="mx-auto grid max-w-[1320px] grid-cols-12 gap-6 px-6 py-32 md:px-10">
        <header className="col-span-12 md:col-span-4">
          <p className="num mb-3 text-[11px] uppercase tracking-[0.32em] text-marigold">
            The 90-second demo
          </p>
          <h2 className="font-display text-[clamp(34px,4.6vw,58px)] font-light leading-[1.02] tracking-[-0.02em] text-paper">
            Four personas.
            <br />
            <span className="italic text-paper-dim">One block.</span>
          </h2>
          <p className="mt-6 max-w-sm text-[14px] leading-[1.65] text-paper-dim">
            Maria, David, Eli, and Rita drive the entire institutional flow —
            originate, settle, audit, regulate — without exposing a single number
            to the public chain.
          </p>
        </header>

        <ol className="col-span-12 space-y-0 md:col-span-8">
          {beats.map((b, i) => (
            <motion.li
              key={b.t}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.06, duration: 0.55 }}
              className="grid grid-cols-12 gap-4 border-b border-rule py-5"
            >
              <span className="num col-span-2 text-[12px] tracking-[0.1em] text-marigold">
                {b.t}
              </span>
              <span className="col-span-4 text-[14px] font-medium tracking-tight text-paper">
                {b.who}
              </span>
              <span
                className="col-span-6 text-[14px] leading-snug text-paper-dim"
                dangerouslySetInnerHTML={{ __html: b.act }}
              />
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="relative overflow-hidden border-t border-rule">
      <div className="absolute inset-0 tessellation opacity-30" />
      <div className="relative mx-auto grid max-w-[1320px] grid-cols-12 gap-6 px-6 py-32 md:px-10">
        <h2 className="col-span-12 font-display text-[clamp(40px,6vw,90px)] font-light leading-[1] tracking-[-0.02em] text-paper md:col-span-9">
          The technology to fix
          <br />
          institutional crypto exists.
          <br />
          <span className="italic text-marigold">The rail did not.</span>
        </h2>
        <p className="col-span-12 max-w-md text-[14px] leading-[1.7] text-paper-dim md:col-span-3 md:pt-4">
          Trillions in tokenized real-world assets are stuck behind permissioned
          chains, OTC desks, and 2-day settlement windows. Public chains expose
          everything. Tessera closes the gap.
        </p>
      </div>
    </section>
  );
}
