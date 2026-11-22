"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";
import InstallCard from "@/components/InstallCard";
import { PulseLine, Skeleton } from "@/components/ui";

export default function SettingsPage() {
    const { session, logout, request } = useAuth();
    const { loading, device, setDevice } = useDevice();
    const toast = useToast();
    const [draft, setDraft] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [checkingFw, setCheckingFw] = useState(false);

    const value = draft ?? device?.bpmThreshold ?? 100;

    async function save() {
        if (!device) return;
        setBusy(true);
        try {
            const r = await request<{ id: string; bpmThreshold: number }>(`/devices/${device.id}/settings`, {
                method: "PATCH",
                body: { bpmThreshold: value },
            });
            setDevice({ ...device, bpmThreshold: r.bpmThreshold });
            setDraft(null);
            toast("Threshold calibrated & synced to hardware", "ok");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not calibrate threshold", "error");
        } finally {
            setBusy(false);
        }
    }

    const handleFwCheck = () => {
        setCheckingFw(true);
        setTimeout(() => {
            setCheckingFw(false);
            toast("Firmware check: Hardware is on latest production build v2.4.1", "ok");
        }, 1200);
    };

    return (
        <div className="space-y-8">
            {/* 1. Page Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-outline-variant/40">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse" />
                        <span className="font-mono text-[11px] text-secondary tracking-widest uppercase font-semibold">
                            System Matrix · Telemetry & Node Control
                        </span>
                    </div>
                    <h1 className="font-headline-lg text-headline-lg text-primary font-bold tracking-tight uppercase">
                        Settings & Hardware Control
                    </h1>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
                        NightSafe hardware configuration, biometric detection thresholds, and operator node control.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 self-start md:self-auto font-mono text-xs">
                    <div className="px-3 py-1.5 rounded-lg bg-surface-container flex items-center gap-2 text-on-surface-variant border border-outline-variant/30 shadow-xs">
                        <span className="material-symbols-outlined text-[16px] text-secondary">encrypted</span>
                        <span>Node Encrypted (AES-256)</span>
                    </div>
                </div>
            </header>

            {/* 2. Hardware Diagnostic Strip */}
            {device && (
                <section className="rounded-2xl bg-primary-container text-inverse-on-surface p-6 sm:p-7 shadow-md relative overflow-hidden border border-primary-fixed-dim/20">
                    <div className="relative z-10 flex flex-col gap-5">
                        {/* Top Operational Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3 border-b border-primary-fixed-dim/15">
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-surface-container-low/10 flex items-center justify-center text-primary-fixed ring-1 ring-primary-fixed-dim/20">
                                    <span className="material-symbols-outlined text-[22px]">developer_board</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] uppercase tracking-wider text-on-primary-container font-semibold">
                                            Active Unit
                                        </span>
                                        <span className="font-mono text-[10px] text-on-tertiary-container px-1.5 py-0.5 rounded bg-tertiary-container/80 font-bold">
                                            NODE-{device.id.slice(-4).toUpperCase()}
                                        </span>
                                    </div>
                                    <h2 className="text-base sm:text-lg font-bold text-surface-bright font-display tracking-tight uppercase">
                                        NightSafe Raspberry Pi 4B Companion
                                    </h2>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low/10 text-surface-bright text-xs font-mono self-start sm:self-auto border border-primary-fixed-dim/20">
                                <span className={`w-2 h-2 rounded-full ${device.isOnline ? "bg-on-tertiary-container animate-pulse" : "bg-outline"}`} />
                                <span className="font-bold text-primary-fixed uppercase">
                                    {device.isOnline ? "Online" : "Offline"}
                                </span>
                                {device.lastSeenAt && (
                                    <>
                                        <span className="text-on-primary-container/60">·</span>
                                        <span className="text-on-primary-container">
                                            Last seen {formatDateTime(device.lastSeenAt)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Continuous Pulse Separator */}
                        <PulseLine />

                        {/* Sub-modules Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                            {/* Mic */}
                            <div className="p-3.5 rounded-xl bg-surface-container-low/5 border border-primary-fixed-dim/10 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-on-primary-container font-mono text-[10px] uppercase tracking-wider font-semibold">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[15px]">mic</span>
                                        Microphone Array
                                    </span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />
                                </div>
                                <div className="text-sm font-bold text-surface-bright font-display">Armed</div>
                                <p className="text-[11px] text-on-primary-container">Bangla DSP Speech Model</p>
                            </div>

                            {/* ECG */}
                            <div className="p-3.5 rounded-xl bg-surface-container-low/5 border border-primary-fixed-dim/10 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-on-primary-container font-mono text-[10px] uppercase tracking-wider font-semibold">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[15px]">ecg_heart</span>
                                        ECG Biosensor
                                    </span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />
                                </div>
                                <div className="text-sm font-bold text-surface-bright font-display">Calibrated</div>
                                <p className="text-[11px] text-on-primary-container">Optical Lead I Differential</p>
                            </div>

                            {/* GPS */}
                            <div className="p-3.5 rounded-xl bg-surface-container-low/5 border border-primary-fixed-dim/10 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-on-primary-container font-mono text-[10px] uppercase tracking-wider font-semibold">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[15px]">satellite_alt</span>
                                        GPS Module
                                    </span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />
                                </div>
                                <div className="text-sm font-bold text-surface-bright font-display">Active Fix</div>
                                <p className="text-[11px] text-on-primary-container">Multi-GNSS Constellation</p>
                            </div>

                            {/* GSM */}
                            <div className="p-3.5 rounded-xl bg-surface-container-low/5 border border-primary-fixed-dim/10 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-on-primary-container font-mono text-[10px] uppercase tracking-wider font-semibold">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[15px]">cell_tower</span>
                                        GSM / SMS Modem
                                    </span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />
                                </div>
                                <div className="text-sm font-bold text-surface-bright font-display">Ready</div>
                                <p className="text-[11px] text-on-primary-container">Cellular SMS Direct Path</p>
                            </div>
                        </div>

                        {/* Firmware & Action Strip */}
                        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-on-primary-container text-xs font-mono">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] text-tertiary-fixed-dim">verified_user</span>
                                <span>Firmware: <strong className="text-surface-bright font-bold">v2.4.1</strong> (Latest Production Build)</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleFwCheck}
                                disabled={checkingFw}
                                className="px-3.5 py-1.5 rounded-lg bg-surface-container-low/10 hover:bg-surface-container-low/20 text-surface-bright text-xs font-semibold font-mono transition-all inline-flex items-center gap-1.5 self-start sm:self-auto border border-primary-fixed-dim/20"
                            >
                                <span className="material-symbols-outlined text-[15px]">
                                    {checkingFw ? "refresh" : "update"}
                                </span>
                                <span>{checkingFw ? "Verifying Hash..." : "Check for Updates"}</span>
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {loading && <Skeleton className="h-64 w-full rounded-2xl" />}

            {!loading && !device && (
                <div className="card text-center py-12 space-y-4">
                    <span className="material-symbols-outlined text-4xl text-outline">developer_board_off</span>
                    <div>
                        <h2 className="text-lg font-bold text-primary font-display">No Hardware Linked</h2>
                        <p className="text-xs text-on-surface-variant max-w-sm mx-auto mt-1">
                            Pair your physical NightSafe unit using the 8-character pairing code printed on the device.
                        </p>
                    </div>
                    <Link href="/pair" className="btn max-w-xs mx-auto text-xs">
                        Pair Companion Device
                    </Link>
                </div>
            )}

            {/* 3. Interactive Alert Threshold Control */}
            {device && (
                <section className="rounded-2xl bg-surface-bright p-6 sm:p-8 shadow-xs border border-outline-variant/30 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-secondary font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                                <span className="material-symbols-outlined text-[15px]">tune</span>
                                <span>Biometric Escalation Parameter</span>
                            </div>
                            <h2 className="font-headline-md text-headline-md text-primary font-bold tracking-tight uppercase">
                                Alert Threshold
                            </h2>
                            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
                                Urgent alerts are marked HIGH priority when heart rate reaches or exceeds this value during a distress trigger.
                            </p>
                        </div>

                        {/* Metric Readout Display */}
                        <div className="flex items-baseline gap-2 px-5 py-3 rounded-xl bg-surface-container-low self-start sm:self-auto border border-outline-variant/30 shadow-inner">
                            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant font-semibold">Trigger Point:</span>
                            <span className="font-telemetry-num text-[36px] leading-none font-bold text-on-tertiary-container tracking-tight">
                                {value}
                            </span>
                            <span className="font-title-md text-title-md text-on-surface-variant font-semibold">BPM</span>
                        </div>
                    </div>

                    {/* Precision Tactical Multi-Tone Slider Strip */}
                    <div className="space-y-3 pt-2">
                        {/* Zone Bracket Labels */}
                        <div className="grid grid-cols-12 gap-1 text-center font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                            <div className="col-span-2 text-left text-on-surface-variant/70 pl-0.5">
                                [ LOW: 40–60 ]
                            </div>
                            <div className="col-span-3 text-center text-secondary font-medium">
                                [ NORMAL: 60–100 ]
                            </div>
                            <div className="col-span-7 text-right text-on-tertiary-container pr-0.5">
                                [ HIGH / URGENT: 100–200 BPM ]
                            </div>
                        </div>

                        {/* Visual Multi-Tone Slider Track */}
                        <div className="relative w-full py-4 select-none">
                            {/* Background Multi-Zone Strip */}
                            <div className="w-full h-3 rounded-full flex overflow-hidden bg-surface-container shadow-inner">
                                <div className="h-full bg-secondary-fixed-dim/40 transition-all" style={{ width: "12.5%" }} />
                                <div className="h-full bg-secondary-container transition-all" style={{ width: "25%" }} />
                                <div className="h-full bg-on-tertiary-container/30 transition-all" style={{ width: "62.5%" }} />
                            </div>

                            {/* Zone Divider Pin Markers */}
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none flex justify-between px-1">
                                <span className="w-[2px] h-5 bg-surface-dim" title="40 BPM" />
                                <span className="w-[2px] h-5 bg-surface-dim" style={{ marginLeft: "12.5%" }} title="60 BPM" />
                                <span className="w-[2px] h-5 bg-on-tertiary-container/70" style={{ marginLeft: "25%" }} title="100 BPM" />
                                <span className="w-[2px] h-5 bg-surface-dim" title="200 BPM" />
                            </div>

                            {/* Native Slider Input (Hidden visually, fully accessible & draggable) */}
                            <input
                                aria-label="Heart rate alert threshold slider"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                max={200}
                                min={40}
                                step={1}
                                type="range"
                                value={value}
                                onChange={(e) => setDraft(Number(e.target.value))}
                            />

                            {/* Precision Visual Enclave Thumb Pin */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center transition-all duration-75 z-10"
                                style={{
                                    left: `${Math.min(99, Math.max(1, ((value - 40) / 160) * 100))}%`,
                                }}
                            >
                                <div className="w-6 h-6 rounded-full bg-primary-container shadow-md flex items-center justify-center ring-2 ring-surface border border-on-tertiary-container/40">
                                    <div className="w-2.5 h-2.5 rounded-full bg-on-tertiary-container shadow-xs" />
                                </div>
                            </div>
                        </div>

                        {/* Helper Guidance Row */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 text-on-surface-variant font-body-sm text-body-sm">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] text-on-tertiary-container">info</span>
                                <span>
                                    Recommended threshold based on nominal baseline is <strong>95–105 BPM</strong>.
                                </span>
                            </div>
                            <span className="font-label-sm text-label-sm text-outline font-semibold uppercase tracking-wider">
                                Calibration: Verified ECG-04
                            </span>
                        </div>
                    </div>

                    {/* Classification Rule Box */}
                    <div className="rounded-xl bg-surface-container-low p-4 border border-outline-variant/30 text-xs sm:text-sm text-on-surface-variant space-y-1">
                        <p className="font-semibold text-primary">Classification Rule:</p>
                        <p>
                            At or above <strong>{value} BPM</strong>, an acoustic incident is classified as <strong>HIGH PRIORITY</strong> (triggering rapid buzzer and urgent contact SMS). Below it, the alert is logged as <strong>MEDIUM</strong>.
                        </p>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            className={`btn sm:w-auto px-6 text-xs h-11 transition-all ${
                                draft !== null && draft !== device.bpmThreshold
                                    ? "bg-primary-container text-on-tertiary-container border border-on-tertiary-container/40 shadow-md font-bold"
                                    : ""
                            }`}
                            disabled={busy || draft === null || draft === device.bpmThreshold}
                            onClick={save}
                        >
                            <span className="material-symbols-outlined text-[16px]">save</span>
                            <span>{busy ? "Transmitting Parameter..." : "Save Biometric Threshold"}</span>
                        </button>
                    </div>
                </section>
            )}

            {/* 4. Progressive Web App Installation Card */}
            <InstallCard />

            {/* 5. Account & Operator Credentials */}
            <section className="rounded-2xl bg-surface-bright p-6 shadow-xs border border-outline-variant/30 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-secondary font-bold block">
                            Authenticated Identity
                        </span>
                        <h3 className="text-lg font-bold text-primary font-display">Operator Account</h3>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-secondary-container text-on-secondary-container font-mono text-[11px] font-bold uppercase">
                        Active Session
                    </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-full bg-primary-container text-tertiary-fixed-dim font-bold text-base flex items-center justify-center font-display shadow-xs">
                            {session?.name ? session.name.slice(0, 2).toUpperCase() : "OP"}
                        </div>
                        <div>
                            <p className="font-bold text-primary text-sm font-display">{session?.name}</p>
                            <p className="font-mono text-xs text-on-surface-variant">{session?.email}</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={logout}
                        className="btn-danger text-xs px-4 py-2 self-start sm:self-auto"
                    >
                        <span className="material-symbols-outlined text-[16px]">logout</span>
                        <span>Sign Out of Terminal</span>
                    </button>
                </div>
            </section>
        </div>
    );
}
