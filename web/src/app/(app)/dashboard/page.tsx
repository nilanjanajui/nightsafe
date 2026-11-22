"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { useLive } from "@/hooks/useLive";
import { useNow } from "@/hooks/useNow";
import { ago, formatDateTime, formatTime, mapsUrl, smsLabel, uptimeLabel } from "@/lib/format";
import type { Contact } from "@/lib/types";
import Sparkline from "@/components/Sparkline";
import { Icon, Skeleton } from "@/components/ui";

// Leaflet touches `window`, so it must never render on the server.
const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false, loading: () => <Skeleton className="h-64" /> });

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex items-center justify-between py-2 text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium">{value}</span>
    </div>
);

export default function Dashboard() {
    const { request } = useAuth();
    const { loading, device, error, reload } = useDevice();
    const { live, alert, dismissAlert } = useLive(device?.id);
    const now = useNow(1000);
    const [contactCount, setContactCount] = useState<number | null>(null);

    useEffect(() => {
        let alive = true;
        request<Contact[]>("/contacts").then((c) => alive && setContactCount(c.length)).catch(() => { });
        return () => {
            alive = false;
        };
    }, [request]);

    if (loading) return <><Skeleton className="h-16" /><Skeleton className="h-48" /><Skeleton className="h-72" /></>;
    if (error) {
        return (
            <div className="card space-y-3">
                <p role="alert" className="text-red-600">{error}</p>
                <button className="btn-soft" onClick={() => void reload()}>Try again</button>
            </div>
        );
    }
    if (!device) {
        return (
            <div className="card space-y-3 text-center">
                <h1 className="text-lg font-semibold">Pair your NightSafe device</h1>
                <p className="text-slate-500">Enter the code printed on the sticker on your device.</p>
                <Link href="/pair" className="btn">Pair a device</Link>
            </div>
        );
    }

    const online = live.online ?? device.isOnline;
    const elevated = live.bpm !== null && live.bpm >= device.bpmThreshold;
    const stale = online && live.at !== null && now - Date.parse(live.at) > 15000;
    const bn = "font-[family-name:var(--font-bengali)]";

    return (
        <>
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">NightSafe</h1>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live status</p>
                </div>
                <span className={`chip ${online ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                    <span className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
                    {online ? "Online" : "Offline"}
                </span>
            </header>

            {alert && (
                <div role="alert" className="card space-y-2 bg-red-50 ring-red-300">
                    <div className="flex items-center justify-between">
                        <strong className="flex items-center gap-1.5 text-sm uppercase text-red-700"><Icon name="alert" className="h-4 w-4" />{alert.priority} priority alert · {ago(alert.createdAt, now)}</strong>
                        <button onClick={dismissAlert} className="text-sm font-medium text-slate-600">Dismiss</button>
                    </div>
                    <p lang="bn" className={`text-2xl ${bn}`}>{alert.transcript}</p>
                    <p className="text-sm text-slate-700">
                        {alert.bpm !== null ? `${Math.round(alert.bpm)} BPM` : "Heart rate unavailable"} · {smsLabel(alert)}
                    </p>
                    {alert.latitude !== null && alert.longitude !== null && (
                        <a className="btn bg-red-700" href={mapsUrl(alert.latitude, alert.longitude)} target="_blank" rel="noreferrer">
                            <Icon name="send" />Open location
                        </a>
                    )}
                </div>
            )}

            {contactCount === 0 && (
                <div className="card space-y-2 bg-amber-50 ring-amber-300">
                    <p className="font-semibold text-amber-900">No emergency contacts yet</p>
                    <p className="text-sm text-amber-900">Alerts won't reach anyone until you add at least one.</p>
                    <Link href="/contacts" className="btn-soft">Add a contact</Link>
                </div>
            )}

            <section className="card space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-1.5 font-semibold"><Icon name="heart" className="h-4 w-4 text-red-600" />Heart rate</h2>
                    {live.bpm !== null && (
                        <span className={`chip ${elevated ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{elevated ? "Elevated" : "Normal"}</span>
                    )}
                </div>
                <p className={`text-6xl font-bold tabular-nums ${elevated ? "text-red-600" : ""}`}>
                    {live.bpm !== null ? Math.round(live.bpm) : "--"} <span className="text-lg font-medium text-slate-500">BPM</span>
                </p>
                <Sparkline values={live.trend} threshold={device.bpmThreshold} />
                <p className="text-sm text-slate-500">Elevated at {device.bpmThreshold}+ BPM (dashed line).</p>
                <p className={`text-xs ${stale ? "font-semibold text-amber-700" : "text-slate-400"}`}>
                    {live.at
                        ? `${stale ? "No data for" : "Updated"} ${ago(live.at, now).replace(" ago", "")}${stale ? "" : " ago"}`
                        : online ? "Waiting for data..." : device.lastSeenAt ? `Last seen ${formatDateTime(device.lastSeenAt)}` : "Never connected"}
                </p>
            </section>

            <section className="card space-y-2">
                <h2 className="flex items-center gap-1.5 font-semibold"><Icon name="pin" className="h-4 w-4" />Location</h2>
                {live.lat !== null && live.lng !== null ? (
                    <>
                        <LiveMap lat={live.lat} lng={live.lng} />
                        <p className="text-xs text-slate-500">{live.lat.toFixed(4)}, {live.lng.toFixed(4)}{live.at ? ` · updated ${formatTime(live.at)}` : ""}</p>
                        <a className="btn" href={mapsUrl(live.lat, live.lng)} target="_blank" rel="noreferrer">Open in Google Maps</a>
                    </>
                ) : (
                    <p className="text-sm text-slate-500">No GPS fix yet. GPS works best with a clear view of the sky.</p>
                )}
            </section>

            <section className="card divide-y divide-slate-100">
                <h2 className="pb-2 font-semibold">Device health</h2>
                <Row label="Voice listening" value={live.listening === null ? "Not reported" : live.listening ? "Active" : "Stopped"} />
                <Row label="WiFi signal" value={live.wifiSignalPct === null ? "Not reported" : `${live.wifiSignalPct}%`} />
                <Row label="Running for" value={live.uptimeSec === null ? "Not reported" : uptimeLabel(live.uptimeSec)} />
            </section>
        </>
    );
}