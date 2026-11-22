"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui";

const tabs: { href: string; label: string; icon: IconName }[] = [
    { href: "/dashboard", label: "Live", icon: "pulse" },
    { href: "/alerts", label: "Alerts", icon: "bell" },
    { href: "/contacts", label: "Contacts", icon: "users" },
    { href: "/settings", label: "Settings", icon: "sliders" },
];

export default function BottomNav() {
    const path = usePathname();
    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
            <ul className="mx-auto grid max-w-xl grid-cols-4">
                {tabs.map((t) => {
                    const active = path.startsWith(t.href);
                    return (
                        <li key={t.href}>
                            <Link href={t.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${active ? "font-bold text-black" : "text-slate-500"}`}>
                                <Icon name={t.icon} />
                                {t.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}