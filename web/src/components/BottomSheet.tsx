"use client";

import { useEffect, type ReactNode } from "react";

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

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="w-full max-w-lg rounded-t-2xl bg-surface-bright p-6 shadow-2xl border-t border-x border-outline-variant/50 animate-in slide-in-from-bottom-8 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-outline-variant/70" />
                {title && (
                    <h3 className="mb-2 text-lg font-bold text-primary font-display uppercase tracking-tight">
                        {title}
                    </h3>
                )}
                <div className="space-y-3">{children}</div>
            </div>
        </div>
    );
}
