"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
    { href: "/dashboard", label: "Live", icon: "vital_signs" },
    { href: "/alerts", label: "Alerts", icon: "warning" },
    { href: "/contacts", label: "Contacts", icon: "verified_user" },
    { href: "/settings", label: "Settings", icon: "tune" },
] as const;

export default function BottomNav() {
    const path = usePathname();
    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 bg-surface/90 backdrop-blur-xl shadow-[0_-2px_12px_rgba(40,48,28,0.05)] pb-[env(safe-area-inset-bottom)] md:hidden">
            <div className="flex justify-around items-center h-[70px] px-4">
                {tabs.map((t) => {
                    const active = path.startsWith(t.href);
                    return (
                        <Link
                            key={t.href}
                            href={t.href}
                            className={`flex flex-col items-center justify-center w-16 h-12 transition-colors gap-0.5 ${
                                active
                                    ? "text-primary font-semibold relative after:content-[''] after:absolute after:bottom-[-2px] after:w-1.5 after:h-1.5 after:bg-on-tertiary-container after:rounded-full"
                                    : "text-on-surface-variant hover:text-on-surface"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[24px]">{t.icon}</span>
                            <span className="font-label-sm text-label-sm tracking-tight">{t.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
