"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

const format = (v: string) => {
    const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};

export default function PairPage() {
    const { request } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await request("/devices/pair", { method: "POST", body: { code } });
            toast("Hardware unit linked & provisioned", "ok");
            router.replace("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Pairing failed");
            setBusy(false);
        }
    }

    const cleanCode = code.replace("-", "");

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="max-w-lg mx-auto py-8 space-y-6"
        >
            <motion.header
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="space-y-1.5 text-center"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-outline-variant/30 text-[11px] font-mono text-secondary font-semibold">
                    <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-ping" />
                    <span>Hardware Node Binding</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-primary font-display uppercase tracking-tight">
                    Pair NightSafe Companion
                </h1>
                <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto">
                    Enter the 8-character hardware identification code printed on the regulatory label of your physical unit.
                </p>
            </motion.header>

            <motion.form
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 25, delay: 0.1 }}
                onSubmit={onSubmit}
                className="rounded-2xl bg-surface-bright border border-outline-variant/40 p-6 sm:p-8 shadow-xs space-y-5"
            >
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: -6 }}
                            animate={{ opacity: 1, height: "auto", y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -6 }}
                            role="alert"
                            className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-start gap-2 overflow-hidden"
                        >
                            <span className="material-symbols-outlined text-[16px] text-red-600 mt-0.5 shrink-0">error</span>
                            <span>{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="space-y-2 text-center">
                    <label className="label text-center" htmlFor="deviceCode">
                        Device Registration Code
                    </label>
                    <input
                        id="deviceCode"
                        className="input text-center font-mono text-2xl uppercase tracking-[0.35em] h-14 font-bold bg-surface-container-low transition-all focus:border-secondary focus:ring-1 focus:ring-secondary"
                        placeholder="XXXX-XXXX"
                        autoComplete="off"
                        autoCapitalize="characters"
                        value={code}
                        onChange={(e) => {
                            setCode(format(e.target.value));
                            setError(null);
                        }}
                    />
                    <p className="text-[11px] text-on-surface-variant font-mono">
                        Format: 8 alphanumeric characters (e.g. UGGN-XLW7)
                    </p>
                </div>

                <div className="rounded-xl bg-surface-container-low p-4 border border-outline-variant/30 space-y-2 text-xs text-on-surface-variant">
                    <div className="flex items-center gap-2 font-bold text-primary font-mono text-[11px] uppercase">
                        <span className="material-symbols-outlined text-[16px] text-secondary">info</span>
                        <span>Where to find this code:</span>
                    </div>
                    <p>• On the label on the underside of your Raspberry Pi 5 unit.</p>
                    <p>• In development mode: check the output of `npm run seed` in your server console.</p>
                </div>

                <motion.button
                    type="submit"
                    whileHover={{ scale: cleanCode.length === 8 && !busy ? 1.01 : 1 }}
                    whileTap={{ scale: cleanCode.length === 8 && !busy ? 0.98 : 1 }}
                    className="btn h-12 text-xs font-semibold tracking-wide"
                    disabled={busy || cleanCode.length !== 8}
                >
                    {busy ? (
                        <span className="flex items-center gap-2">
                            <span className="h-4 w-4 border-2 border-surface-container-low border-t-transparent rounded-full animate-spin" />
                            <span>Claiming & Binding Device...</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <span>Claim & Bind Device</span>
                            <span className="material-symbols-outlined text-[16px]">link</span>
                        </span>
                    )}
                </motion.button>
            </motion.form>
        </motion.div>
    );
}
