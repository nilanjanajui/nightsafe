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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
                {title && <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>}
                <div className="space-y-3">{children}</div>
            </div>
        </div>
    );
}

