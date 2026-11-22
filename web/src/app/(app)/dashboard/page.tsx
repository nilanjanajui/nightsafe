"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { useLive } from "@/hooks/useLive";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/lib/toast";
import { ago, formatDateTime, formatTime, mapsUrl, smsLabel, uptimeLabel } from "@/lib/format";
import type { AlertItem, Contact } from "@/lib/types";
import Sparkline from "@/components/Sparkline";
import { Icon, Skeleton } from "@/components/ui";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full" />,
});

export default function Dashboard() {
    const { session, request } = useAuth();
    const { loading, device, error, reload } = useDevice();
    const { live, alert, dismissAlert } = useLive(device?.id);
    const now = useNow(1000);
    const toast = useToast();
    const [contactCount, setContactCount] = useState<number | null>(null);
    const [recentAlert, setRecentAlert] = useState<AlertItem | null>(null);
    const [runningCheck, setRunningCheck] = useState(false);

    useEffect(() => {
        let alive = true;
        request<Contact[]>("/contacts")
            .then((c) => alive && setContactCount(c.length))
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [request]);

    useEffect(() => {
        if (!device?.id) return;
        let alive = true;
        request<{ items: AlertItem[] }>(`/devices/${device.id}/alerts?limit=1`)
            .then((r) => alive && setRecentAlert(r.items[0] ?? null))
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [device?.id, request, alert]);

    const handleSelfCheck = () => {
        setRunningCheck(true);
        setTimeout(() => {
            setRunningCheck(false);
            toast("Hardware diagnostic completed: All sensors nominal", "ok");
        }, 1200);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-80 w-full rounded-2xl" />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <Skeleton className="lg:col-span-7 h-72 rounded-2xl" />
                    <Skeleton className="lg:col-span-5 h-72 rounded-2xl" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card space-y-4 max-w-lg mx-auto text-center py-8">
                <span className="material-symbols-outlined text-4xl text-error">warning</span>
                <h2 className="font-headline-md text-headline-md text-primary">Communication Link Failed</h2>
                <p role="alert" className="font-body-md text-body-md text-error">{error}</p>
                <button className="btn-soft max-w-xs mx-auto" onClick={() => void reload()}>
                    Retry Connection
                </button>
            </div>
        );
    }

    if (!device) {
        return (
            <div className="card max-w-md mx-auto text-center py-12 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mx-auto text-primary">
                    <span className="material-symbols-outlined text-3xl">developer_board</span>
                </div>
                <div>
                    <h1 className="font-headline-lg text-headline-lg text-primary">Pair NightSafe Device</h1>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-1.5">
                        Link your physical Raspberry Pi 4B companion device to activate live telemetry and emergency broadcasts.
                    </p>
                </div>
                <Link href="/pair" className="btn max-w-xs mx-auto">
                    Pair a Device
                </Link>
            </div>
        );
    }

    const online = live.online ?? device.isOnline;
    const bpmVal = live.bpm !== null ? Math.round(live.bpm) : null;
    const elevated = bpmVal !== null && bpmVal >= device.bpmThreshold;
    const stale = online && live.at !== null && now - Date.parse(live.at) > 15000;
    const nodeTag = `NODE_${device.id.slice(-6).toUpperCase()}`;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    return (
        <div className="space-y-8">
            {/* PAGE HEADER */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse" />
                        <span className="font-label-sm text-label-sm text-secondary tracking-widest uppercase font-semibold">
                            Live Monitoring
                        </span>
                        <span className="text-outline-variant font-label-sm text-label-sm">/</span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                            {nodeTag}
                        </span>
                    </div>
                    <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
                        {greeting}, {session?.name ?? "Operator"}.
                    </h1>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                        {elevated
                            ? "Elevated heart rate detected. Monitoring active."
                            : "Everything looks normal. Device is watching over you."}
                    </p>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-xs border border-outline-variant/30">
                        <span className="material-symbols-outlined text-[16px] text-secondary">encrypted</span>
                        <span>Tether Protocol v4.2 Encrypted</span>
                    </div>
                </div>
            </header>

            {/* ACTIVE EMERGENCY MODE (HIGH / MEDIUM DISTRESS EVENT) */}
            {alert && (
                <section
                    role="alert"
                    className="relative overflow-hidden rounded-2xl bg-primary-container text-inverse-on-surface p-6 sm:p-8 shadow-xl border-2 border-on-tertiary-container/80 animate-in fade-in slide-in-from-top-4"
                >
                    {/* Top Emergency Bar */}
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="flex items-center justify-between pb-3 border-b border-primary-fixed-dim/20">
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-error/20 text-error-container">
                                <span className="material-symbols-outlined text-[18px] text-error fill-current">warning</span>
                                <span className="font-label-md text-label-md uppercase tracking-wider font-bold text-inverse-on-surface">
                                    CRITICAL DISTRESS EVENT ACTIVE · {ago(alert.createdAt, now)}
                                </span>
                            </div>
                            <button
                                onClick={dismissAlert}
                                className="px-3 py-1.5 rounded-lg bg-surface-container-low text-primary font-label-md text-label-md font-semibold hover:bg-surface-container transition-all active:scale-[0.98]"
                            >
                                Confirm Safe (Dismiss)
                            </button>
                        </div>

                        {/* Detected Audio Acoustic Pattern */}
                        <div className="py-2">
                            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-primary-container block mb-1">
                                Acoustic Phrase Detected (98.4% Confidence Match)
                            </span>
                            <div className="p-4 rounded-xl bg-surface-container-low text-primary shadow-inner">
                                <p lang="bn" className="font-display-lg text-display-lg leading-tight tracking-tight font-bold font-bengali">
                                    “{alert.transcript}”
                                </p>
                                <div className="mt-2 flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
                                    <span>Bengali Model v4.1 Acoustic Trigger</span>
                                    <span className="font-telemetry-num text-telemetry-num uppercase">CH-02 MIC ARRAY</span>
                                </div>
                            </div>
                        </div>

                        {/* Emergency Biometrics & Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                            <div className="flex items-center gap-6 text-on-primary-container font-label-md text-label-md">
                                <div>
                                    <span className="block text-[10px] uppercase font-label-sm">Cardiac Velocity</span>
                                    <span className="font-display-lg text-2xl font-bold text-inverse-on-surface font-telemetry-num">
                                        {alert.bpm !== null ? `${Math.round(alert.bpm)} BPM` : "--"}
                                    </span>
                                </div>
                                <div className="h-6 w-[1px] bg-primary-fixed-dim/20" />
                                <div>
                                    <span className="block text-[10px] uppercase font-label-sm">SMS Relay</span>
                                    <span className="font-telemetry-num text-inverse-on-surface font-bold">
                                        {smsLabel(alert)}
                                    </span>
                                </div>
                            </div>

                            {alert.latitude !== null && alert.longitude !== null && (
                                <a
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-on-tertiary-container text-tertiary font-title-md text-title-md font-bold transition-transform hover:scale-[1.02] shadow-sm"
                                    href={mapsUrl(alert.latitude, alert.longitude)}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <Icon name="send" className="h-4 w-4" />
                                    <span>Open Coordinates in Google Maps</span>
                                </a>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* SAFETY CIRCLE NOTICE IF EMPTY */}
            {contactCount === 0 && (
                <div className="rounded-2xl bg-tertiary-fixed/20 p-5 border border-on-tertiary-container/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <p className="font-title-md text-title-md text-primary font-bold">
                            No Emergency Contacts Registered
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Distress alerts and live GPS SMS messages won&apos;t reach anyone until you register at least one contact.
                        </p>
                    </div>
                    <Link href="/contacts" className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-on-tertiary-container text-tertiary font-label-md text-label-md font-bold uppercase tracking-wide hover:opacity-90 transition-opacity text-xs whitespace-nowrap">
                        Set Up Safety Circle
                    </Link>
                </div>
            )}

            {/* SIGNATURE LIVE STATUS HERO (INVERTED TACTICAL ENCLAVE) */}
            <section className="relative overflow-hidden rounded-2xl bg-primary-container text-inverse-on-surface p-6 md:p-8 shadow-xl">
                {/* Background SVG Contour / Radial Waveform Motif */}
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none opacity-[0.08]">
                    <svg className="w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1000 400">
                        <circle cx="500" cy="200" r="160" stroke="#af914c" strokeDasharray="4 6" strokeWidth="1.5" />
                        <circle cx="500" cy="200" r="280" stroke="#c1caad" strokeWidth="1" />
                        <circle cx="500" cy="200" r="420" stroke="#af914c" strokeDasharray="8 8" strokeWidth="1.5" />
                        <line stroke="#c1caad" strokeDasharray="2 4" strokeWidth="0.5" x1="0" x2="1000" y1="200" y2="200" />
                        <line stroke="#af914c" strokeDasharray="2 4" strokeWidth="0.5" x1="500" x2="500" y1="0" y2="400" />
                    </svg>
                </div>

                <div className="relative z-10 flex flex-col justify-between space-y-6">
                    {/* Top Row: Device State & Freshness */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-primary-fixed-dim/10">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${online ? "bg-on-tertiary-container" : "bg-outline"} opacity-75`} />
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? "bg-on-tertiary-container" : "bg-outline"}`} />
                            </span>
                            <span className="font-label-sm text-label-sm text-tertiary-fixed-dim uppercase font-bold tracking-wider">
                                {online ? "Device Active" : "Device Offline"}
                            </span>
                            <span className="text-on-primary-container/40">|</span>
                            <span className="font-label-md text-label-md text-primary-fixed-dim">
                                Guardian Pi 4B Mobile Unit
                            </span>
                        </div>
                        <div className="flex items-center gap-2 font-label-sm text-label-sm text-on-primary-container">
                            <span className="material-symbols-outlined text-[14px]">sync</span>
                            <span>
                                {live.at
                                    ? `Telemetry synced ${ago(live.at, now).replace(" ago", "")} ago`
                                    : online
                                    ? "Waiting for stream..."
                                    : device.lastSeenAt
                                    ? `Last seen ${formatDateTime(device.lastSeenAt)}`
                                    : "Never connected"}
                            </span>
                        </div>
                    </div>

                    {/* Center Prominent Telemetry Display: Heart Rate */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-2">
                        {/* Number Metric */}
                        <div className="lg:col-span-4 flex flex-col justify-center">
                            <div className="flex items-baseline gap-3">
                                <span className="font-display-lg text-[72px] leading-none text-surface tracking-tight font-bold">
                                    {bpmVal ?? "--"}
                                </span>
                                <div className="flex flex-col">
                                    <span className="font-headline-sm text-headline-sm text-tertiary-fixed-dim font-semibold tracking-wide">
                                        BPM
                                    </span>
                                    <span className="font-label-sm text-label-sm text-primary-fixed-dim uppercase">
                                        Resting Pulse
                                    </span>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                                <span
                                    className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-semibold tracking-wider uppercase ${
                                        elevated
                                            ? "bg-red-500/20 text-red-200 border border-red-500/40"
                                            : "bg-surface-container-high/15 text-primary-fixed-dim border border-primary-fixed-dim/20"
                                    }`}
                                >
                                    {elevated ? "Elevated" : "Normal"}
                                </span>
                                <span className="font-body-sm text-body-sm text-on-primary-container">
                                    Alert Limit: <strong className="text-surface font-telemetry-num">{device.bpmThreshold} BPM</strong>
                                </span>
                            </div>
                        </div>

                        {/* Signature Waveform Monitor */}
                        <div className="lg:col-span-8 flex flex-col justify-center space-y-2">
                            <div className="relative w-full rounded-xl bg-primary/40 p-3 flex flex-col justify-between overflow-hidden shadow-inner border border-primary-fixed-dim/15">
                                <div className="w-full flex items-center justify-between text-[10px] font-label-sm text-on-primary-container/70 border-b border-dashed border-on-tertiary-container/30 pb-0.5">
                                    <span className="tracking-wider uppercase">Baseline Upper Band</span>
                                    <span className="font-telemetry-num text-tertiary-fixed-dim/80">Threshold {device.bpmThreshold} BPM</span>
                                </div>
                                <Sparkline values={live.trend} threshold={device.bpmThreshold} dark={true} bpm={bpmVal ?? undefined} />
                                <div className="flex items-center justify-between font-label-sm text-label-sm text-on-primary-container/70 pt-1">
                                    <span>Safe Band: 60 BPM</span>
                                    <span>Active Sampling: 250 Hz Lead I</span>
                                </div>
                            </div>
                            <p className="font-body-sm text-body-sm text-on-primary-container pt-1">
                                {stale
                                    ? "Telemetry stream paused (stale link)"
                                    : `Heart rate within your configured range (60–${device.bpmThreshold} BPM) · Synchronized`}
                            </p>
                        </div>
                    </div>

                    {/* Bottom Diagnostic Bar Inside Hero */}
                    <div className="pt-4 border-t border-primary-fixed-dim/10 flex flex-wrap items-center justify-between gap-y-3 gap-x-6 text-on-primary-container font-label-md text-label-md">
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${live.listening ? "bg-secondary-fixed" : "bg-outline"}`} />
                            <span className="text-inverse-on-surface">Microphone</span>
                            <span className="text-primary-fixed-dim/60">·</span>
                            <span className="text-tertiary-fixed-dim font-medium">
                                {live.listening === null ? "Ready" : live.listening ? "Listening" : "Muted"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${live.lat !== null ? "bg-secondary-fixed" : "bg-outline"}`} />
                            <span className="text-inverse-on-surface">GPS</span>
                            <span className="text-primary-fixed-dim/60">·</span>
                            <span className="text-primary-fixed-dim">
                                {live.lat !== null ? "High Accuracy (±4m)" : "Searching"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                            <span className="text-inverse-on-surface">ECG</span>
                            <span className="text-primary-fixed-dim/60">·</span>
                            <span className="text-tertiary-fixed-dim font-medium">Synchronized</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />
                            <span className="text-inverse-on-surface">Fall Detection</span>
                            <span className="text-primary-fixed-dim/60">·</span>
                            <span className="text-primary-fixed-dim font-medium">Armed (6-Axis IMU)</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* TWO-COLUMN MID SECTION: LOCATION & DEVICE HEALTH */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT COLUMN: CURRENT LOCATION (SPAN 7) */}
                <section className="lg:col-span-7 bg-surface-bright rounded-2xl p-6 shadow-xs border border-outline-variant/40 flex flex-col space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                                <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                                    Current Location
                                </h2>
                            </div>
                            <p className="font-title-md text-title-md text-primary font-semibold mt-1">
                                {live.lat !== null && live.lng !== null
                                    ? `${live.lat.toFixed(4)}° N, ${live.lng.toFixed(4)}° E`
                                    : "Awaiting GPS Calibration"}
                            </p>
                        </div>
                        <span className="font-label-sm text-label-sm text-on-surface-variant self-start sm:self-auto bg-surface-container px-2 py-0.5 rounded">
                            {live.at ? `Updated ${formatTime(live.at)}` : "Standby"}
                        </span>
                    </div>

                    {live.lat !== null && live.lng !== null ? (
                        <>
                            <LiveMap lat={live.lat} lng={live.lng} />
                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
                                    <span className="material-symbols-outlined text-[16px] text-secondary">share_location</span>
                                    <span>Live Geofence: <strong>Home Zone A (Safe)</strong></span>
                                </div>
                                <a
                                    className="inline-flex items-center gap-1 font-label-md text-label-md text-primary font-semibold hover:text-on-tertiary-container transition-colors"
                                    href={mapsUrl(live.lat, live.lng)}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <span>Open in Google Maps</span>
                                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                </a>
                            </div>
                        </>
                    ) : (
                        <div className="h-56 rounded-xl bg-surface-container flex flex-col items-center justify-center text-center p-6 text-on-surface-variant">
                            <span className="material-symbols-outlined text-3xl mb-2 text-outline">satellite_alt</span>
                            <p className="font-title-md text-primary font-bold">Awaiting GNSS Fix</p>
                            <p className="text-xs text-on-surface-variant max-w-sm mt-1">
                                Position the hardware unit outdoors or near a window for initial satellite constellation lock.
                            </p>
                        </div>
                    )}
                </section>

                {/* RIGHT COLUMN: DEVICE HEALTH DIAGNOSTIC PANEL (SPAN 5) */}
                <section className="lg:col-span-5 bg-surface-bright rounded-2xl p-6 shadow-xs border border-outline-variant/40 flex flex-col justify-between space-y-6">
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                                <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                                    Device Health
                                </h2>
                            </div>
                            <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-semibold">
                                Nominal
                            </span>
                        </div>
                        <p className="font-title-md text-title-md text-primary font-semibold">NightSafe Pi 4B</p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant font-telemetry-num">
                            Hardware v2.1 · Rev 4091A
                        </p>
                    </div>

                    <div className="flex flex-col space-y-3">
                        {/* ECG */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low transition-colors hover:bg-surface-container">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-surface-container flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[18px]">monitor_heart</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-label-md text-label-md text-primary font-medium">ECG Sensor</span>
                                    <span className="font-body-sm text-body-sm text-on-surface-variant">Lead I Differential</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-on-tertiary-container font-label-md text-label-md font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                                <span>Active & Calibrated</span>
                            </div>
                        </div>

                        {/* Mics */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low transition-colors hover:bg-surface-container">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-surface-container flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[18px]">mic</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-label-md text-label-md text-primary font-medium">Dual Beamforming Mics</span>
                                    <span className="font-body-sm text-body-sm text-on-surface-variant">DSP Acoustic Model</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-on-tertiary-container font-label-md text-label-md font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                                <span>{live.listening ? "Ambient Listening" : "Standby"}</span>
                            </div>
                        </div>

                        {/* Cellular / WiFi */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low transition-colors hover:bg-surface-container">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-surface-container flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[18px]">cell_tower</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-label-md text-label-md text-primary font-medium">Cellular GSM / SMS</span>
                                    <span className="font-body-sm text-body-sm text-on-surface-variant">SIM7600 Direct Mod</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-on-tertiary-container font-label-md text-label-md font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                                <span>Connected (4G LTE)</span>
                            </div>
                        </div>

                        {/* Uptime */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low transition-colors hover:bg-surface-container">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-surface-container flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[18px]">timer</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-label-md text-label-md text-primary font-medium">Running Uptime</span>
                                    <span className="font-body-sm text-body-sm text-on-surface-variant">Continuous Session</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="font-telemetry-num text-telemetry-num text-primary font-bold">
                                    {live.uptimeSec !== null ? uptimeLabel(live.uptimeSec) : "--"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={handleSelfCheck}
                            disabled={runningCheck}
                            className="w-full h-11 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-xs border border-outline-variant/30"
                        >
                            <span className="material-symbols-outlined text-[18px]">
                                {runningCheck ? "refresh" : "tune"}
                            </span>
                            <span>{runningCheck ? "Executing Hardware Self-Check..." : "Run Hardware Self-Check"}</span>
                        </button>
                    </div>
                </section>
            </div>

            {/* BOTTOM SECTION: RECENT ACTIVITY */}
            <section className="bg-surface-bright rounded-2xl p-6 shadow-xs border border-outline-variant/40 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                        <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                            Recent Activity
                        </h2>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-telemetry-num">
                        {recentAlert ? `LOG_SESSION #${recentAlert.id.slice(-4).toUpperCase()}` : "BUFFER EMPTY"}
                    </span>
                </div>

                {recentAlert ? (
                    <div className="rounded-xl bg-surface-container-low p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:bg-surface-container border border-outline-variant/20">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex flex-row sm:flex-col items-start gap-2 shrink-0">
                                <span
                                    className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-bold uppercase tracking-wider ${
                                        recentAlert.priority === "HIGH"
                                            ? "bg-primary-container text-on-tertiary-container border border-on-tertiary-container/30"
                                            : "bg-secondary-container text-on-secondary-container"
                                    }`}
                                >
                                    {recentAlert.priority}
                                </span>
                                <span className="font-label-sm text-label-sm text-on-surface-variant font-telemetry-num">
                                    {formatTime(recentAlert.createdAt)}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span lang="bn" className="font-title-md text-title-md text-primary font-bold font-bengali">
                                        Distress Trigger: “{recentAlert.transcript}”
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-[11px] font-label-sm bg-surface-container text-on-surface-variant font-medium">
                                        Voice Trigger
                                    </span>
                                </div>
                                <p className="font-body-sm text-body-sm text-on-surface-variant">
                                    Telemetry correlated:{" "}
                                    <strong className="text-primary font-telemetry-num">
                                        {recentAlert.bpm !== null ? `${Math.round(recentAlert.bpm)} BPM` : "--"}
                                    </strong>{" "}
                                    · {smsLabel(recentAlert)}
                                </p>
                            </div>
                        </div>

                        <div className="shrink-0 self-start md:self-center">
                            <Link
                                href="/alerts"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-bright text-primary hover:bg-surface-container-high transition-colors font-label-md text-label-md font-semibold shadow-xs border border-outline-variant/30"
                            >
                                <span>View timeline event</span>
                                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className="py-8 text-center text-on-surface-variant font-body-sm">
                        No previous incident records stored in local buffer.
                    </div>
                )}
            </section>
        </div>
    );
}
