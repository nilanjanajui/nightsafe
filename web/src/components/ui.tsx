import type { ReactNode } from "react";

const PATHS = {
    pulse: <path d="M3 12h4l3-7 4 14 3-7h4" />,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3.2 3.2 0 0 1 0 6" /><path d="M18 14c2 .6 3.5 2.6 3.5 6" /></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
    heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
    pin: <><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
    send: <path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" />,
    shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
    wifi: <><path d="M2 9a15 15 0 0 1 20 0" /><path d="M5.5 12.5a10 10 0 0 1 13 0" /><path d="M9 16a5 5 0 0 1 6 0" /><circle cx="12" cy="19" r="1" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    phone: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
    alert: <><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18h.01" /></>,
    refresh: <><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    satellite: <><path d="M13 7 9 3 5 7l4 4" /><path d="m17 11 4 4-4 4-4-4" /><path d="m8 12 4 4" /><path d="m16 8-4-4" /><path d="M12 12 2 22" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            {PATHS[name]}
        </svg>
    );
}

export const Skeleton = ({ className = "h-24" }: { className?: string }) => (
    <div className={`animate-pulse rounded-xl bg-surface-container-high/60 ${className}`} />
);

export const PageTitle = ({
    title,
    sub,
    category = "System Matrix",
    tag,
}: {
    title: string;
    sub?: string;
    category?: string;
    tag?: string;
}) => (
    <header className="space-y-1.5 pb-2">
        <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-on-tertiary-container animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant font-display">
                {category}
            </span>
            {tag && (
                <>
                    <span className="text-outline-variant text-xs">/</span>
                    <span className="text-[11px] font-medium text-secondary tracking-wider font-mono">
                        {tag}
                    </span>
                </>
            )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary font-display uppercase">
            {title}
        </h1>
        {sub && <p className="text-sm text-on-surface-variant max-w-2xl">{sub}</p>}
    </header>
);

export function NightSafeLogo({ className = "h-8 w-auto" }: { className?: string }) {
    return (
        <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center shadow-xs">
                <svg className="w-5 h-5 text-tertiary-fixed-dim" fill="none" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
                    <circle cx="16" cy="16" r="7" stroke="currentColor" strokeDasharray="3 2" strokeWidth="1.25" />
                    <circle cx="16" cy="16" fill="currentColor" r="2.5" />
                    <path d="M4 16h6l2-4 3 8 2.5-5 1.5 2h9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
                </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold tracking-tight text-primary font-display">
                    NightSafe
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-surface-container text-on-surface-variant border border-outline-variant/40">
                    Core
                </span>
            </div>
        </div>
    );
}

export function PulseLine({ className = "" }: { className?: string }) {
    return (
        <div className={`w-full flex items-center gap-2 text-outline-variant/60 ${className}`}>
            <div className="h-[1px] flex-1 bg-outline-variant/30" />
            <svg className="w-8 h-3 text-on-tertiary-container shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 32 12">
                <path d="M0 6h8l2-4 3 8 3-8 2 4h14" />
            </svg>
            <div className="h-[1px] flex-1 bg-outline-variant/30" />
        </div>
    );
}
