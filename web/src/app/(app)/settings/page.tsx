"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { formatDateTime } from "@/lib/format";
import InstallCard from "@/components/InstallCard";
import { PageTitle, Skeleton } from "@/components/ui";

export default function SettingsPage() {
    const { session, logout, request } = useAuth();
    const { loading, device, setDevice } = useDevice();
    const [draft, setDraft] = useState<number | null>(null);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const value = draft ?? device?.bpmThreshold ?? 100;

    async function save() {
        if (!device) return;
        setBusy(true);
        setMsg(null);
        try {
            const r = await request<{ id: string; bpmThreshold: number }>(`/devices/${device.id}/settings`, { method: "PATCH", body: { bpmThreshold: value } });
            setDevice({ ...device, bpmThreshold: r.bpmThreshold });
            setDraft(null);
            setMsg({ ok: true, text: "Saved. An online device applies it right away; an offline one gets it when it reconnects." });
        } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <PageTitle title="Settings" sub="Your device and your account." />

            <section className="card space-y-3">
                <h2 className="font-semibold">Heart-rate threshold</h2>
                {loading && <Skeleton className="h-24" />}
                {!loading && !device && <p className="text-sm text-slate-500">No device paired. <Link href="/pair" className="font-medium underline">Pair one</Link></p>}
                {device && (
                    <>
                        <p className="text-5xl font-bold tabular-nums">{value} <span className="text-lg font-medium text-slate-500">BPM</span></p>
                        <input type="range" min={40} max={200} value={value} onChange={(e) => setDraft(Number(e.target.value))} className="w-full accent-black" aria-label="Heart-rate threshold in BPM" />
                        <div className="flex justify-between text-xs text-slate-500"><span>40</span><span>100</span><span>200</span></div>
                        <p className="rounded-xl bg-[var(--tint)] p-3 text-sm">At or above this rate an urgent alert is marked <strong>HIGH</strong> priority, below it <strong>MEDIUM</strong>. An alert is sent either way.</p>
                        <button className="btn" disabled={busy || draft === null || draft === device.bpmThreshold} onClick={save}>{busy ? "Saving..." : "Save threshold"}</button>
                        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
                    </>
                )}
            </section>

            {device && (
                <section className="card space-y-1">
                    <h2 className="font-semibold">Device</h2>
                    <p className="text-sm">{device.isOnline ? "Online" : "Offline"}{device.lastSeenAt ? ` · last seen ${formatDateTime(device.lastSeenAt)}` : ""}</p>
                </section>
            )}

            <InstallCard />

            <section className="card space-y-3">
                <h2 className="font-semibold">Account</h2>
                <p className="text-sm text-slate-600">{session?.name}<br />{session?.email}</p>
                <button className="btn-danger" onClick={logout}>Sign out</button>
            </section>
        </>
    );
}