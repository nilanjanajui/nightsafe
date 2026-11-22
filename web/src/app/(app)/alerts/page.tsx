"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/lib/socket";
import { useDevice } from "@/hooks/useDevice";
import { useNow } from "@/hooks/useNow";
import { ago, dayLabel, formatDateTime, mapsUrl, smsLabel } from "@/lib/format";
import type { AlertItem } from "@/lib/types";
import { Icon, PageTitle, Skeleton } from "@/components/ui";

const FILTERS = [["ALL", "All"], ["HIGH", "High priority"], ["MEDIUM", "Medium"]] as const;
type Filter = (typeof FILTERS)[number][0];
type Page = { items: AlertItem[]; nextCursor: string | null };

export default function AlertsPage() {
    const { request } = useAuth();
    const { socket } = useSocket();
    const { loading, device } = useDevice();
    const now = useNow(30000);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [items, setItems] = useState<AlertItem[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const id = device?.id;

    const load = useCallback(
        async (after?: string | null) => {
            if (!id) return;
            if (after) setBusy(true);
            try {
                const qs = new URLSearchParams({ limit: "20" });
                if (after) qs.set("cursor", after);
                if (filter !== "ALL") qs.set("priority", filter);
                const page = await request<Page>(`/devices/${id}/alerts?${qs}`);
                setItems((prev) => (after ? [...prev, ...page.items] : page.items));
                setCursor(page.nextCursor);
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load alerts");
            } finally {
                setBusy(false);
                setLoaded(true);
            }
        },
        [id, filter, request]
    );

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!id) return;
        const onAlert = (a: AlertItem) => {
            if (a.deviceId !== id || (filter !== "ALL" && a.priority !== filter)) return;
            setItems((p) => (p.some((x) => x.id === a.id) ? p : [a, ...p]));
        };
        const onUpdated = (a: AlertItem) => setItems((p) => p.map((x) => (x.id === a.id ? a : x)));
        socket.on("alert", onAlert);
        socket.on("alert:updated", onUpdated);
        return () => {
            socket.off("alert", onAlert);
            socket.off("alert:updated", onUpdated);
        };
    }, [socket, id, filter]);

    const groups = useMemo(() => {
        const m = new Map<string, AlertItem[]>();
        for (const a of items) {
            const k = dayLabel(a.createdAt, now);
            m.set(k, [...(m.get(k) ?? []), a]);
        }
        return [...m.entries()];
    }, [items, now]);

    return (
        <>
            <PageTitle title="Alert history" sub="Every urgent alert your device has raised." />
            <div className="flex gap-2 overflow-x-auto" role="tablist">
                {FILTERS.map(([key, label]) => (
                    <button key={key} role="tab" aria-selected={filter === key}
                        onClick={() => { setFilter(key); setLoaded(false); setItems([]); }}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${filter === key ? "bg-black text-white" : "bg-white ring-1 ring-slate-200"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {(loading || (id && !loaded)) && <Skeleton className="h-40" />}
            {!loading && !device && <p className="text-slate-500">Pair a device to see its alerts.</p>}
            {loaded && items.length === 0 && !error && (
                <div className="card text-center text-slate-500"><Icon name="shield" className="mx-auto mb-2 h-8 w-8" />No alerts yet. That's good news.</div>
            )}

            {groups.map(([day, list]) => (
                <section key={day} className="space-y-3">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{day}</h2>
                    {list.map((a) => (
                        <article key={a.id} className={`card space-y-2 border-l-4 ${a.priority === "HIGH" ? "border-l-red-600" : "border-l-amber-500"}`}>
                            <div className="flex items-center justify-between">
                                <span className={`chip ${a.priority === "HIGH" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{a.priority}</span>
                                <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)} className="text-xs text-slate-500">{ago(a.createdAt, now)}</time>
                            </div>
                            <p lang="bn" className="font-[family-name:var(--font-bengali)] text-2xl leading-relaxed">{a.transcript}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                                <span className="flex items-center gap-1.5"><Icon name="heart" className="h-4 w-4" />{a.bpm !== null ? `${Math.round(a.bpm)} BPM` : "Heart rate unavailable"}</span>
                                <span className="flex items-center gap-1.5"><Icon name="send" className="h-4 w-4" />{smsLabel(a)}</span>
                            </div>
                            {a.latitude !== null && a.longitude !== null ? (
                                <a className="btn-soft" href={mapsUrl(a.latitude, a.longitude)} target="_blank" rel="noreferrer"><Icon name="pin" className="h-4 w-4" />View location</a>
                            ) : (
                                <p className="text-sm text-slate-500">No GPS fix at the time.</p>
                            )}
                        </article>
                    ))}
                </section>
            ))}

            {cursor && <button className="btn-soft" disabled={busy} onClick={() => load(cursor)}>{busy ? "Loading..." : "Load more alerts"}</button>}
        </>
    );
}