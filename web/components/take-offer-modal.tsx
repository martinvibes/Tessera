"use client";

import { Modal } from "@/components/modal";
import { symbolForAsset, type OfferTerms } from "@/lib/offer";

/**
 * Reusable confirmation dialog for taking/accepting any offer — open from the
 * order book or from a shared link. The caller drives the busy/error/success
 * state externally so this component stays purely presentational.
 */
export function TakeOfferModal({
  open,
  terms,
  busy,
  busyLabel,
  error,
  successLabel,
  status,
  onCancel,
  onConfirm,
  title = "Take this offer?",
  subtitle = "Both sides of the swap settle in a single transaction. Either both succeed, or nothing moves.",
  confirmLabel = "Confirm & sign",
  takerLabel = "You receive",
  payerLabel = "You pay",
}: {
  open: boolean;
  terms: OfferTerms | null;
  busy: boolean;
  busyLabel?: string;
  error: string | null;
  successLabel?: string;
  status?: "idle" | "signing" | "submitting" | "settled";
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  takerLabel?: string;
  payerLabel?: string;
}) {
  const sellSymbol = terms ? symbolForAsset(terms.sellAsset) : null;
  const buySymbol = terms ? symbolForAsset(terms.buyAsset) : null;
  const sell = terms ? BigInt(terms.sellAmount) : 0n;
  const buy = terms ? BigInt(terms.buyAmount) : 0n;
  const price = terms && sell > 0n ? Number(buy) / Number(sell) : 0;
  const expires = terms ? new Date(Number(terms.deadline) * 1000) : null;

  const isSettled = status === "settled";
  const stageLabel =
    status === "signing"
      ? "Signing in your wallet"
      : status === "submitting"
        ? "Settling on-chain"
        : busyLabel ?? "Signing & settling";

  return (
    <Modal open={open} onClose={busy ? () => {} : onCancel} labelledBy="take-title">
      <div className="border-b border-rule px-6 py-4">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
          Confirm trade
        </p>
      </div>

      <div className="px-6 py-6">
        <h3
          id="take-title"
          className="font-display text-[26px] font-light leading-tight tracking-[-0.01em] text-paper"
        >
          {title}
        </h3>
        <p className="mt-2 max-w-md text-[14px] leading-snug text-paper-dim">
          {subtitle}
        </p>

        {terms && (
          <>
            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden border border-rule bg-rule">
              <Pane
                label={takerLabel}
                amount={sell}
                symbol={sellSymbol}
                tone="incoming"
              />
              <Pane
                label={payerLabel}
                amount={buy}
                symbol={buySymbol}
                tone="outgoing"
              />
            </div>

            <dl className="mt-6 space-y-2.5 text-[13px]">
              <Row k="Price">
                <span className="num text-paper">
                  1 {sellSymbol} = {price.toFixed(4)} {buySymbol}
                </span>
              </Row>
              <Row k="Counterparty">
                <span className="num text-paper-dim">
                  {terms.seller.slice(0, 10)}…{terms.seller.slice(-6)}
                </span>
              </Row>
              <Row k="Offer expires">
                <span className="num text-paper-dim">
                  {expires?.toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </Row>
              <Row k="Settlement">
                <span className="num text-paper-dim">Atomic on-chain</span>
              </Row>
            </dl>
          </>
        )}

        {error && (
          <div className="mt-5 border-l-2 border-crimson bg-crimson/5 p-3">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">Error</p>
            <p className="mt-1 break-words text-[13px] text-paper">{error}</p>
          </div>
        )}

        {isSettled && (
          <div className="mt-5 border-l-2 border-sage bg-sage/5 p-3">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">
              {successLabel ?? "Settled atomically ✓"}
            </p>
            <p className="mt-1 text-[13px] text-paper">
              Both balances have updated on-chain.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper disabled:opacity-50"
        >
          {isSettled ? "Done" : "Cancel"}
        </button>
        {!isSettled && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
          >
            {busy ? (
              <>
                <Spinner /> {stageLabel}
              </>
            ) : (
              <>{confirmLabel}</>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Pane({
  label,
  amount,
  symbol,
  tone,
}: {
  label: string;
  amount: bigint;
  symbol: string | null;
  tone: "incoming" | "outgoing";
}) {
  return (
    <div className="bg-ink-2 px-5 py-5">
      <p
        className={`num text-[10px] uppercase tracking-[0.24em] ${
          tone === "incoming" ? "text-sage" : "text-marigold"
        }`}
      >
        {label}
      </p>
      <p className="num mt-2 font-display text-[34px] font-light leading-none text-paper">
        {amount.toLocaleString("en-US")}
      </p>
      <p className="num mt-2 text-[11px] uppercase tracking-[0.18em] text-paper-faint">
        {symbol}
      </p>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-2">
      <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        {k}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  );
}
