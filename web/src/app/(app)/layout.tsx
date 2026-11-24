"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { SocketProvider } from "@/lib/socket";
import { ToastProvider } from "@/lib/toast";
import BottomNav from "@/components/BottomNav";
import ConnectionStrip from "@/components/ConnectionStrip";
import { NightSafeLogo } from "@/components/ui";

const navItems = [
    { href: "/dashboard", label: "Live", path: "live" },
    { href: "/alerts", label: "Alerts", path: "alerts" },
    { href: "/contacts", label: "Contacts", path: "contacts" },
    { href: "/settings", label: "Settings", path: "settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { ready, session, logout } = useAuth();
    const { device } = useDevice();
    const router = useRouter();
    const pathname = usePathname();
    const [profileOpen, setProfileOpen] = useState(false);

    useEffect(() => {
        if (ready && !session) router.replace("/login");
    }, [ready, session, router]);

    if (!ready || !session) {
        return (
            <div className="grid min-h-dvh place-items-center bg-surface-container-low text-on-surface-variant font-display text-sm tracking-wider uppercase">
                <div className="flex flex-col items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-on-tertiary-container animate-ping" />
                    <span>Initializing NightSafe Node...</span>
                </div>
            </div>
        );
    }

    const online = device?.isOnline ?? true;

    return (
        <SocketProvider key={session.token} token={session.token}>
            <ToastProvider>
                <div className="min-h-dvh bg-surface-container-low flex flex-col selection:bg-secondary-container selection:text-primary">
                    {/* Fixed Top Navigation Bar */}
                    <header className="sticky top-0 z-40 w-full border-b border-outline-variant/30 bg-surface/90 backdrop-blur-md shadow-xs">
                        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="h-16 flex items-center justify-between gap-4">
                                {/* Brand Logo */}
                                <Link href="/dashboard" className="shrink-0 transition-opacity hover:opacity-90">
                                    <NightSafeLogo />
                                </Link>

                                {/* Desktop Nav Links */}
                                <nav className="hidden md:flex items-center gap-1.5 p-1 rounded-lg bg-surface-container/70 border border-outline-variant/30">
                                    {navItems.map((item) => {
                                        const active = pathname.startsWith(item.href);
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${active
                                                        ? "bg-secondary-container text-primary font-bold shadow-xs relative after:content-[''] after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:bg-on-tertiary-container"
                                                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                                                    }`}
                                            >
                                                {item.label}
                                            </Link>
                                        );
                                    })}
                                </nav>

                                {/* Right Side: Device Status & User Menu */}
                                <div className="flex items-center gap-3 shrink-0">
                                    {/* Online / Offline status badge */}
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant/40 text-[11px] font-semibold text-primary">
                                        <span
                                            className={`h-2 w-2 rounded-full ${online
                                                    ? "bg-on-tertiary-container animate-pulse"
                                                    : "bg-outline"
                                                }`}
                                        />
                                        <span className="hidden sm:inline font-mono uppercase text-[10px] tracking-wider">
                                            {online ? "Online" : "Offline"}
                                        </span>
                                    </div>

                                    {/* User Profile / Logout */}
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setProfileOpen((p) => !p)}
                                            className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-surface-container transition-colors"
                                            aria-label="User menu"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-primary-container text-tertiary-fixed-dim font-bold text-xs flex items-center justify-center ring-1 ring-outline-variant/40">
                                                <span className="material-symbols-outlined text-[18px]">person</span>
                                            </div>
                                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                                                expand_more
                                            </span>
                                        </button>

                                        {profileOpen && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setProfileOpen(false)}
                                                />
                                                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-surface-container-lowest p-2 shadow-lg ring-1 ring-outline-variant/40 z-50 animate-in fade-in zoom-in-95">
                                                    <div className="px-3 py-2 border-b border-outline-variant/30">
                                                        <p className="text-xs font-semibold text-primary truncate">{session.name}</p>
                                                        <p className="text-[11px] text-on-surface-variant truncate">{session.email}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setProfileOpen(false);
                                                            logout();
                                                        }}
                                                        className="mt-1 w-full text-left px-3 py-2 text-xs font-semibold text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">logout</span>
                                                        <span>Sign Out</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </header>

                    <ConnectionStrip />

                    {/* Main Content Area */}
                    <motion.main
                        key={pathname}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12"
                    >
                        {children}
                    </motion.main>

                    {/* Mobile Navigation */}
                    <BottomNav />
                </div>
            </ToastProvider>
        </SocketProvider>
    );
}
