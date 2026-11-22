"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Kind = "ok" | "error";
type Toast = { id: number; text: string; kind: Kind };
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => { });
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
            <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-xl flex-col gap-2 px-4">
                {items.map((t) => (
                    <div key={t.id} className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${t.kind === "ok" ? "bg-slate-900" : "bg-red-600"}`}>
                        {t.text}
                    </div>
                ))}
            </div>
        </Ctx.Provider>
    );
}