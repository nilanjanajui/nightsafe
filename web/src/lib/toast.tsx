"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Kind = "ok" | "error";
type Toast = { id: number; text: string; kind: Kind };

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<Toast[]>([]);
    const next = useRef(1);

    const push = useCallback((text: string, kind: Kind = "ok") => {
        const id = next.current++;
        setItems((p) => [...p, { id, text, kind }]);
        setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 4000);
    }, []);

    return (
        <Ctx.Provider value={push}>
            {children}
            <div
                aria-live="polite"
                className="pointer-events-none fixed bottom-20 md:bottom-6 right-0 md:right-6 left-0 md:left-auto z-[70] mx-auto flex w-full max-w-sm flex-col gap-2 px-4"
            >
                {items.map((t) => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-xs font-semibold shadow-xl transition-all duration-200 animate-in slide-in-from-bottom-2 ${
                            t.kind === "ok"
                                ? "bg-primary-container text-surface-bright border border-on-tertiary-container/40"
                                : "bg-red-950 text-red-100 border border-red-500/50"
                        }`}
                    >
                        <span
                            className={`material-symbols-outlined text-[18px] shrink-0 ${
                                t.kind === "ok" ? "text-on-tertiary-container" : "text-red-400"
                            }`}
                        >
                            {t.kind === "ok" ? "check_circle" : "warning"}
                        </span>
                        <span className="flex-1 leading-snug">{t.text}</span>
                    </div>
                ))}
            </div>
        </Ctx.Provider>
    );
}
