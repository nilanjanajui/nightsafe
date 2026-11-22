"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageTitle } from "@/components/ui";

const format = (v: string) => {
    const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};

export default function PairPage() {
    const { request } = useAuth();
    const router = useRouter();
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await request("/devices/pair", { method: "POST", body: { code } });
            router.replace("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Pairing failed");
            setBusy(false);
        }
    }

    return (
        <>
            <PageTitle title="Pair your device" sub="Enter the 8-character code printed on the sticker on your NightSafe device." />
            <form onSubmit={onSubmit} className="card space-y-3">
                <label className="label" htmlFor="code">Device code</label>
                <input id="code" className="input text-center font-mono text-xl uppercase tracking-[0.3em]" placeholder="XXXX-XXXX" autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(format(e.target.value))} />
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button className="btn" disabled={busy || code.replace("-", "").length !== 8}>{busy ? "Pairing..." : "Pair device"}</button>
            </form>
            <p className="text-xs text-slate-500">Development: use the PAIRING_CODE printed by `npm run seed`.</p>
        </>
    );
}