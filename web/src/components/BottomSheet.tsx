"use client";

import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BottomSheetProps {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: ReactNode;
}

export default function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-xs"
                    onClick={onClose}
                    role="dialog"
                    aria-modal="true"
                >
                    <motion.div
                        initial={{ y: "100%", opacity: 0.8 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 28, stiffness: 320 }}
                        className="w-full max-w-lg rounded-t-2xl bg-surface-bright p-6 shadow-2xl border-t border-x border-outline-variant/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-outline-variant/70" />
                        {title && (
                            <h3 className="mb-2 text-lg font-bold text-primary font-display uppercase tracking-tight">
                                {title}
                            </h3>
                        )}
                        <div className="space-y-3">{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
