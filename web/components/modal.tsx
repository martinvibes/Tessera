"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * Editorial modal: opaque backdrop + bordered panel. Closes on
 * backdrop click and Escape. Body scroll locked while open.
 * Adapts to mobile by capping at 92vh and scrolling the inner panel.
 */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const widthClass = size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="fixed inset-0 z-[100] flex items-end justify-center px-0 sm:items-center sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* backdrop */}
          <motion.button
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-ink/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          {/* panel — bottom-sheet on mobile, centered on desktop */}
          <motion.div
            className={`relative z-10 flex w-full ${widthClass} max-h-[92vh] flex-col overflow-hidden border border-rule bg-ink-2 shadow-2xl sm:rounded-none`}
            initial={{ opacity: 0, y: 24, scale: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
