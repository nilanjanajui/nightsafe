"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/lib/socket";
import { useDevice } from "@/hooks/useDevice";
import { useNow } from "@/hooks/useNow";
import { dayLabel, formatDateTime, formatTime, mapsUrl, smsLabel } from "@/lib/format";
import type { AlertItem } from "@/lib/types";
import { Icon, Skeleton } from "@/components/ui";

const FILTERS = [
    ["ALL", "All"],
    ["HIGH", "High Priority"],
    ["MEDIUM", "Medium"],
    ["SYSTEM", "System Check"],
] as const;
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
    const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const id = device?.id;

    useEffect(() => {
        let active = true;
        if (!id) return;
        void (async () => {
            try {
                const qs = new URLSearchParams({ limit: "20" });
                if (filter === "HIGH" || filter === "MEDIUM") qs.set("priority", filter);
                // SYSTEM filter is UI-only (no backend support), so we fetch all and show empty state
                const page = await request<Page>(`/devices/${id}/alerts?${qs}`);
                if (!active) return;
                setItems(page.items);
                setCursor(page.nextCursor);
                setError(null);
                if (page.items.length > 0) {
                    setSelectedAlert((prev) => prev ?? page.items[0]);
                }
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Failed to load alerts");
            } finally {
                if (active) {
                    setBusy(false);
                    setLoaded(true);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, [id, filter, request]);

    const loadMore = useCallback(
        async (after: string) => {
            if (!id || busy) return;
            setBusy(true);
            try {
                const qs = new URLSearchParams({ limit: "20", cursor: after });
                if (filter === "HIGH" || filter === "MEDIUM") qs.set("priority", filter);
                const page = await request<Page>(`/devices/${id}/alerts?${qs}`);
                setItems((prev) => [...prev, ...page.items]);
                setCursor(page.nextCursor);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load alerts");
            } finally {
                setBusy(false);
            }
        },
        [id, filter, request, busy]
    );

    useEffect(() => {
        if (!id) return;
        const onAlert = (a: AlertItem) => {
            const priorityFilter = filter === "HIGH" || filter === "MEDIUM";
            if (a.deviceId !== id || (priorityFilter && a.priority !== filter)) return;
            setItems((p) => {
                const exists = p.some((x) => x.id === a.id);
                return exists ? p : [a, ...p];
            });
            setSelectedAlert((prev) => prev ?? a);
        };
        const onUpdated = (a: AlertItem) => {
            setItems((p) => p.map((x) => (x.id === a.id ? a : x)));
            setSelectedAlert((prev) => (prev?.id === a.id ? a : prev));
        };
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

    const activeItem = selectedAlert ?? items[0] ?? null;

    return (
        <div className="space-y-8">
            {/* Top Streamline Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-outline-variant/40">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse" />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-secondary font-semibold">
                            Tether Telemetry Buffer
                        </span>
                        <span className="text-outline-variant text-xs">/</span>
                        <span className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant font-medium">
                            Archive {id ? `NS-${id.slice(-4).toUpperCase()}` : "NS-T992"}
                        </span>
                    </div>
                    <h1 className="font-headline-lg text-headline-lg text-primary font-bold tracking-tight uppercase">
                        Alert History
                    </h1>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                        Every event and safety intervention detected by NightSafe hardware.
                    </p>
                </div>

                {/* Tactical Filter Group */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-surface-container/70 border border-outline-variant/40 self-start md:self-auto">
                    {FILTERS.map(([key, label]) => {
                        const active = filter === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => {
                                    setFilter(key);
                                    setItems([]);
                                    setCursor(null);
                                    setSelectedAlert(null);
                                    setLoaded(false);
                                }}
                                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-all flex items-center gap-1.5 ${
                                    active
                                        ? "bg-primary-container text-on-tertiary-container shadow-sm font-bold"
                                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {error && (
                <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                    {error}
                </div>
            )}

            {(loading || (id && !loaded)) && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <Skeleton className="lg:col-span-7 h-96 rounded-2xl" />
                    <Skeleton className="lg:col-span-5 h-96 rounded-2xl" />
                </div>
            )}

            {!loading && !device && (
                <div className="card text-center py-12">
                    <p className="text-sm text-on-surface-variant font-mono">Pair a device to view archived safety events.</p>
                </div>
            )}

            {loaded && items.length === 0 && !error && (
                <div className="card text-center py-16 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mx-auto text-primary">
                        <span className="material-symbols-outlined text-2xl">verified_user</span>
                    </div>
                    <h3 className="text-base font-bold text-primary font-display">No Incident Records Found</h3>
                    <p className="text-xs sm:text-sm text-on-surface-variant max-w-sm mx-auto">
                        Zero distress alerts or abnormal vital spikes logged in this buffer. All parameters nominal.
                    </p>
                </div>
            )}

            {items.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* LEFT COLUMN: Vertical Timeline (7 cols) */}
                    <div className="lg:col-span-7 space-y-8">
                        {groups.map(([day, list]) => (
                            <section key={day} className="space-y-4">
                                <div className="flex items-center gap-2 pb-1">
                                    <div className="flex items-center justify-center w-5 h-5 rounded bg-surface-container text-secondary text-[11px] font-mono border border-outline-variant/40">
                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                                    </div>
                                    <span className="font-mono text-xs tracking-wider uppercase font-bold text-secondary">
                                        {day}
                                    </span>
                                    <div className="flex-1 h-[1px] bg-outline-variant/40" />
                                </div>

                                <div className="relative pl-6 sm:pl-8 space-y-4">
                                    {/* Continuous vertical timeline spine */}
                                    <div className="absolute left-2.5 sm:left-3 top-2 bottom-4 w-[2px] bg-secondary/25 -translate-x-1/2" />

                                    {list.map((a, idx) => {
                                        const isHigh = a.priority === "HIGH";
                                        const isSelected = activeItem?.id === a.id;

                                        return (
                                            <motion.div
                                                key={a.id}
                                                initial={{ opacity: 0, x: -12 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.25, delay: idx * 0.04 }}
                                                whileHover={{ x: 2 }}
                                                onClick={() => setSelectedAlert(a)}
                                                className="relative group cursor-pointer"
                                            >
                                                {/* Node Pin */}
                                                <div
                                                    className={`absolute -left-6 sm:-left-8 top-5 w-4 h-4 rounded-full flex items-center justify-center -translate-x-1/2 shadow-xs transition-transform ${
                                                        isHigh
                                                            ? "bg-primary-container border-2 border-on-tertiary-container"
                                                            : "bg-surface-container-highest border border-secondary"
                                                    } ${isSelected ? "scale-125" : ""}`}
                                                >
                                                    {isHigh && <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-ping" />}
                                                </div>

                                                {/* Card */}
                                                <div
                                                    className={`rounded-2xl p-5 transition-all ${
                                                        isHigh
                                                            ? "bg-primary-container text-inverse-on-surface border-2 border-on-tertiary-container/80 shadow-md"
                                                            : "bg-surface-bright text-on-surface border border-outline-variant/40 shadow-xs hover:border-primary/40"
                                                    } ${isSelected ? "ring-2 ring-primary" : ""}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono ${
                                                                    isHigh
                                                                        ? "bg-on-tertiary-container/20 text-on-tertiary-container border border-on-tertiary-container/40"
                                                                        : "bg-secondary-container text-on-secondary-container"
                                                                }`}
                                                            >
                                                                {a.priority} Priority
                                                            </span>
                                                            <span className="text-xs opacity-60">•</span>
                                                            <span className="font-mono text-xs">
                                                                {formatTime(a.createdAt)}
                                                            </span>
                                                        </div>
                                                        <span className="font-mono text-[10px] uppercase opacity-70">
                                                            REC #{a.id.slice(-4).toUpperCase()}
                                                        </span>
                                                    </div>

                                                    <div className="mb-3">
                                                        <p lang="bn" className="text-xl font-bold font-bengali leading-snug">
                                                            “{a.transcript}”
                                                        </p>
                                                    </div>

                                                    <div
                                                        className={`flex flex-wrap items-center gap-3 text-xs font-mono py-2 px-3 rounded-lg ${
                                                            isHigh ? "bg-inverse-surface/60 text-inverse-on-surface" : "bg-surface-container text-on-surface-variant"
                                                        }`}
                                                    >
                                                        <span>
                                                            Heart Rate: <strong>{a.bpm !== null ? `${Math.round(a.bpm)} BPM` : "--"}</strong>
                                                        </span>
                                                        <span>•</span>
                                                        <span>{smsLabel(a)}</span>
                                                    </div>

                                                    <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-xs font-semibold">
                                                        <span className="inline-flex items-center gap-1">
                                                            <span>Inspect incident audit</span>
                                                            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                                                        </span>
                                                        {isSelected && (
                                                            <span className="px-2 py-0.5 rounded bg-on-tertiary-container/15 text-on-tertiary-container text-[10px] uppercase font-mono font-bold">
                                                                Selected
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}

                        {cursor && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void loadMore(cursor)}
                                className="btn-soft w-full text-xs font-semibold"
                            >
                                {busy ? "Loading earlier logs..." : "Load Earlier Buffer Records"}
                            </button>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Incident Audit Record Panel (5 cols) */}
                    <div className="lg:col-span-5 lg:sticky lg:top-24">
                        <AnimatePresence mode="wait">
                            {activeItem ? (
                                <motion.div
                                    key={activeItem.id}
                                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                                    transition={{ duration: 0.22 }}
                                    className="rounded-2xl bg-surface-bright border border-outline-variant/40 shadow-sm overflow-hidden space-y-4"
                                >
                                <div className="bg-surface-container px-5 py-3.5 border-b border-outline-variant/30 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-on-tertiary-container" />
                                            <span className="font-mono text-xs uppercase font-bold text-primary tracking-wider">
                                                INCIDENT AUDIT #{activeItem.id.slice(-6).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                                            ID: {activeItem.id.slice(0, 8)} · Encrypted in transit (HTTPS)
                                        </div>
                                    </div>
                                    <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                                            activeItem.priority === "HIGH"
                                                ? "bg-primary-container text-on-tertiary-container border border-on-tertiary-container/30"
                                                : "bg-secondary-container text-on-secondary-container"
                                        }`}
                                    >
                                        {activeItem.priority}
                                    </span>
                                </div>

                                <div className="p-5 space-y-4 text-xs">
                                    <div className="flex items-baseline justify-between border-b border-outline-variant/20 pb-3">
                                        <div>
                                            <span className="font-mono text-[10px] uppercase text-secondary font-bold block">
                                                Incident Time
                                            </span>
                                            <span className="font-mono text-sm text-primary font-bold">
                                                {formatTime(activeItem.createdAt)}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-mono text-[10px] uppercase text-secondary font-bold block">
                                                Date
                                            </span>
                                            <span className="text-primary font-semibold">
                                                {formatDateTime(activeItem.createdAt).split(",")[0]}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Speech trigger matched */}
                                    <div className="rounded-xl bg-surface-container-low p-4 border border-outline-variant/30 space-y-1">
                                        <span className="font-mono text-[10px] uppercase tracking-wider text-secondary font-bold block">
                                            Detected Voice Acoustic Vector
                                        </span>
                                        <div lang="bn" className="text-xl font-bold font-bengali text-primary">
                                            “{activeItem.transcript}”
                                        </div>
                                        <p className="text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/20">
                                            Bangla Neural Speech Trigger · 300ms verification window
                                        </p>
                                    </div>

                                    {/* Two stage architecture breakdown */}
                                    <div className="space-y-2">
                                        <span className="font-mono text-[10px] uppercase font-bold text-primary block">
                                            Two-Stage Architecture Verification
                                        </span>
                                        <div className="rounded-xl bg-surface-container/60 p-3 border border-outline-variant/30 flex items-start gap-2.5">
                                            <span className="material-symbols-outlined text-[16px] text-on-tertiary-container mt-0.5">
                                                check_circle
                                            </span>
                                            <div className="flex-1">
                                                <div className="flex justify-between font-bold text-primary text-xs">
                                                    <span>Stage 1: Distress Speech Match</span>
                                                </div>
                                                <p className="text-[11px] text-on-surface-variant mt-0.5">
                                                    Audio matched on-device neural vocabulary.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-surface-container/60 p-3 border border-outline-variant/30 flex items-start gap-2.5">
                                            <span className="material-symbols-outlined text-[16px] text-on-tertiary-container mt-0.5">
                                                ecg_heart
                                            </span>
                                            <div className="flex-1">
                                                <div className="flex justify-between font-bold text-primary text-xs">
                                                    <span>Stage 2: Urgency check (text classifier)</span>
                                                </div>
                                                <p className="text-[11px] text-on-surface-variant mt-0.5">
                                                    Heart rate sensor reported{" "}
                                                    <strong>{activeItem.bpm !== null ? `${Math.round(activeItem.bpm)} BPM` : "telemetry"}</strong>.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Emergency Map link */}
                                    {activeItem.latitude !== null && activeItem.longitude !== null && (
                                        <div className="pt-2">
                                            <a
                                                className="btn text-xs h-10 w-full"
                                                href={mapsUrl(activeItem.latitude, activeItem.longitude)}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <Icon name="send" className="h-4 w-4" />
                                                <span>View Coordinates on Google Maps</span>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : null}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </div>
    );
}
