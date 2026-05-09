"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
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

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4 sm:px-6"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
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
          {/* panel */}
          <motion.div
            className={`relative z-10 flex w-full ${widthClass} max-h-[92vh] flex-col overflow-hidden border border-rule bg-ink-2 shadow-2xl`}
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

  // Portal to document.body so the modal escapes any parent stacking context
  // (e.g. the sticky header with z-50 that clips the sign-out modal).
  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
