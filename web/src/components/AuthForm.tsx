"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

interface AuthFormProps {
    mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
    const router = useRouter();
    const { ready, session, login, signup } = useAuth();
    const toast = useToast();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isLogin = mode === "login";

    // Auto-redirect if already authenticated in this tab session
    useEffect(() => {
        if (ready && session) {
            router.replace("/dashboard");
        }
    }, [ready, session, router]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
                toast("Terminal session authenticated", "ok");
            } else {
                await signup(name, email, password);
                toast("Operator account provisioned successfully", "ok");
            }
            router.push("/dashboard");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Authentication failed";
            setError(message);
            toast(message, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col lg:flex-row bg-surface-container-low selection:bg-secondary-container selection:text-primary">
            {/* LEFT PANEL: TACTICAL / BRAND INSTRUMENT VIEW (~48% width) */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative w-full lg:w-[48%] bg-primary-container text-surface-container-low flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden min-h-[420px] lg:min-h-screen"
            >
                {/* Background Animated Tactical Radar Reticle */}
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                    <svg className="w-[140%] h-[140%] max-w-none text-tertiary-fixed-dim animate-radar-sweep" fill="none" stroke="currentColor" viewBox="0 0 800 800">
                        <defs>
                            <linearGradient id="radar-beam" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#af914c" stopOpacity="0.35" />
                                <stop offset="60%" stopColor="#af914c" stopOpacity="0.08" />
                                <stop offset="100%" stopColor="#af914c" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {/* Concentric distance rings */}
                        <circle cx="400" cy="400" r="140" strokeDasharray="3 6" strokeWidth="1" />
                        <circle cx="400" cy="400" r="230" strokeWidth="1" />
                        <circle cx="400" cy="400" r="320" strokeDasharray="1 8" strokeWidth="1" />
                        <circle cx="400" cy="400" r="390" strokeWidth="1" />
                        {/* Crosshair axes */}
                        <line strokeDasharray="4 8" strokeWidth="0.75" x1="400" x2="400" y1="40" y2="760" />
                        <line strokeDasharray="4 8" strokeWidth="0.75" x1="40" x2="760" y1="400" y2="400" />
                        {/* Sweeping radar scanner sector beam */}
                        <path d="M 400 400 L 760 400 A 360 360 0 0 0 654 146 Z" fill="url(#radar-beam)" stroke="none" />
                        {/* Calibrated reticle tick marks */}
                        <path d="M 390 170 L 410 170 M 390 630 L 410 630 M 170 390 L 170 410 M 630 390 L 630 410" strokeWidth="1.5" />
                    </svg>
                </div>

                {/* Top Tactical Header: Channel & Coordinate Stamp */}
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-tertiary-container opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-on-tertiary-container" />
                        </span>
                        <span className="font-mono text-[11px] tracking-widest text-on-primary-container uppercase font-semibold">
                            Sys.Node 09 // Standby
                        </span>
                    </div>
                    <div className="font-mono text-[11px] tracking-widest text-on-primary-container flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed animate-pulse" />
                        <span>22°21&apos;23&quot;N · 91°47&apos;14&quot;E</span>
                    </div>
                </div>

                {/* Central Brand Core */}
                <div className="relative z-10 my-auto py-8">
                    {/* Aperture & Pulse Signature Mark with rotating inner ring */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative w-14 h-14 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary-fixed-dim/20">
                            <svg className="w-8 h-8 text-tertiary-fixed-dim" fill="none" viewBox="0 0 32 32">
                                <circle cx="16" cy="16" r="12" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
                                <circle cx="16" cy="16" r="7" stroke="currentColor" strokeDasharray="3 2" strokeWidth="1.25" className="animate-reticle-reverse" />
                                <circle cx="16" cy="16" fill="currentColor" r="2.5" />
                                <path d="M4 16h6l2-4 3 8 2.5-5 1.5 2h9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
                            </svg>
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-secondary-fixed ring-2 ring-primary-container animate-pulse" />
                        </div>
                        <div className="h-px flex-1 bg-gradient-to-r from-tertiary-fixed-dim/40 via-tertiary-fixed-dim/15 to-transparent" />
                    </div>

                    <h1 className="text-3xl sm:text-4xl uppercase tracking-wider text-surface-bright font-bold font-display mb-2">
                        NightSafe
                    </h1>
                    <p className="text-sm sm:text-base text-primary-fixed-dim max-w-sm font-normal">
                        Precision safety telemetry, real-time physiological monitoring, and emergency alerts.
                    </p>

                    {/* Dynamic Micro-Waveform Monitor Track with Live Scan Animation */}
                    <div className="mt-8 p-4 rounded-xl bg-primary/50 backdrop-blur-md max-w-md border border-primary-fixed-dim/20 shadow-inner">
                        <div className="flex justify-between items-center mb-2 text-xs">
                            <span className="font-mono text-[10px] text-on-primary-container uppercase tracking-wider flex items-center gap-2">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-tertiary-container opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-on-tertiary-container" />
                                </span>
                                Heart rate monitor
                            </span>
                            <span className="font-mono font-bold text-tertiary-fixed-dim">Live</span>
                        </div>
                        <div className="relative overflow-hidden rounded">
                            <svg className="w-full h-8 text-tertiary-fixed-dim/90" fill="none" viewBox="0 0 360 32">
                                <path
                                    d="M0 16 H60 L68 16 L74 6 L82 26 L88 12 L94 20 L100 16 H190 L198 16 L204 8 L212 24 L218 14 L224 18 L228 16 H360"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.75"
                                    className="animate-wave-scan"
                                    style={{ filter: "drop-shadow(0 0 4px rgba(175,145,76,0.5))" }}
                                />
                                {/* Pulsing R-peak scanner cursor */}
                                <circle cx="204" cy="8" r="4" fill="#ffdf99" className="animate-ping opacity-60" />
                                <circle cx="204" cy="8" r="2.5" fill="#ffdf99" className="animate-pulse" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Bottom Panel Metadata */}
                <div className="relative z-10 pt-4">
                    <div className="h-px w-full bg-gradient-to-r from-on-primary-container/20 via-on-primary-container/10 to-transparent mb-3" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-on-primary-container font-mono tracking-wider uppercase">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container/80" />
                            <span>Encrypted in transit (HTTPS)</span>
                        </div>
                        <div className="opacity-70">SEC-ID #882-OP-9</div>
                    </div>
                </div>
            </motion.div>

            {/* RIGHT PANEL: AUTHENTICATION CONSOLE (~52% width) */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
                className="w-full lg:w-[52%] bg-surface flex flex-col justify-between p-6 sm:p-12 lg:p-16 relative"
            >
                {/* Top Companion Telemetry Beacon */}
                <div className="w-full flex items-center justify-between pb-6">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="uppercase tracking-wider text-outline">Terminal ID</span>
                        <span className="text-on-surface font-semibold">LOC-GATE-01</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container text-secondary text-[11px] font-semibold border border-outline-variant/30 shadow-xs">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
                        </span>
                        <span>Hardware Gateway Ready</span>
                    </div>
                </div>

                {/* Auth Form Chamber with entrance transition */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="max-w-md w-full mx-auto my-auto py-4"
                >
                    <div className="mb-6">
                        <span className="font-mono text-[10px] tracking-widest uppercase text-outline block mb-1">
                            {isLogin ? "Operational Access" : "Device Provisioning"}
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-bold text-on-surface font-display mb-1">
                            {isLogin ? "Welcome back" : "Create Operator Account"}
                        </h2>
                        <p className="text-xs sm:text-sm text-on-surface-variant">
                            {isLogin
                                ? "Sign in to authenticate your NightSafe terminal session"
                                : "Register credentials to provision your personal safety network"}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, y: -6 }}
                                    animate={{ opacity: 1, height: "auto", y: 0 }}
                                    exit={{ opacity: 0, height: 0, y: -6 }}
                                    role="alert"
                                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 flex items-start gap-2 overflow-hidden"
                                >
                                    <span className="material-symbols-outlined text-[16px] text-red-600 shrink-0">error</span>
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!isLogin && (
                            <div className="space-y-1">
                                <label className="label" htmlFor="operatorName">
                                    Full Name
                                </label>
                                <div className="relative flex items-center">
                                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none select-none leading-none flex items-center justify-center">
                                        badge
                                    </span>
                                    <input
                                        id="operatorName"
                                        type="text"
                                        required
                                        minLength={2}
                                        value={name}
                                        onChange={(e) => {
                                            setName(e.target.value);
                                            setError(null);
                                        }}
                                        placeholder="Jane Doe"
                                        style={{ paddingLeft: "2.75rem" }}
                                        className="input h-11"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="label" htmlFor="terminalEmail">
                                Email Address
                            </label>
                            <div className="relative flex items-center">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none select-none leading-none flex items-center justify-center">
                                    alternate_email
                                </span>
                                <input
                                    id="terminalEmail"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="operator@nightsafe.internal"
                                    style={{ paddingLeft: "2.75rem" }}
                                    className="input h-11"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <label className="label" htmlFor="securityKey">
                                    Security Key / Password
                                </label>
                                {!isLogin && (
                                    <span className="text-[10px] uppercase font-mono text-outline">
                                        Min 8 chars
                                    </span>
                                )}
                            </div>
                            <div className="relative flex items-center">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none select-none leading-none flex items-center justify-center">
                                    key
                                </span>
                                <input
                                    id="securityKey"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    minLength={isLogin ? undefined : 8}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="••••••••••••"
                                    style={{ paddingLeft: "2.75rem", paddingRight: "2.75rem" }}
                                    className="input h-11 font-mono text-sm"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    aria-label="Toggle password visibility"
                                    onClick={() => setShowPassword((p) => !p)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors flex items-center justify-center leading-none"
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        {showPassword ? "visibility_off" : "visibility"}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <motion.button
                            type="submit"
                            disabled={loading}
                            whileHover={{ scale: !loading ? 1.01 : 1 }}
                            whileTap={{ scale: !loading ? 0.98 : 1 }}
                            className="btn h-11 mt-4 shadow-sm group hover:shadow-md transition-all"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 border-2 border-surface-container-low border-t-transparent rounded-full animate-spin" />
                                    <span>Authenticating Node...</span>
                                </span>
                            ) : isLogin ? (
                                <span className="flex items-center gap-2">
                                    <span>Establish Tether</span>
                                    <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1.5 transition-transform">
                                        arrow_forward
                                    </span>
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <span>Provision Account</span>
                                    <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1.5 transition-transform">
                                        arrow_forward
                                    </span>
                                </span>
                            )}
                        </motion.button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-outline-variant/30 text-center">
                        <p className="text-xs text-on-surface-variant">
                            {isLogin ? (
                                <>
                                    Unregistered node?{" "}
                                    <Link
                                        href="/signup"
                                        className="font-bold text-primary hover:text-on-tertiary-container transition-colors underline-offset-4 hover:underline"
                                    >
                                        Provision new device credentials
                                    </Link>
                                </>
                            ) : (
                                <>
                                    Existing operator?{" "}
                                    <Link
                                        href="/login"
                                        className="font-bold text-primary hover:text-on-tertiary-container transition-colors underline-offset-4 hover:underline"
                                    >
                                        Sign in to existing terminal
                                    </Link>
                                </>
                            )}
                        </p>
                    </div>
                </motion.div>

                {/* Bottom Console Footer */}
                <div className="w-full text-center text-[11px] text-outline pt-6">
                    NightSafe Security System · Hardware Cryptographic Standard 800-53
                </div>
            </motion.div>
        </div>
    );
}
