"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };

export default function InstallCard() {
    const [evt, setEvt] = useState<InstallEvent | null>(null);
    const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setEvt(e as InstallEvent);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);
        return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    }, []);

    if (standalone) return null;

    return (
        <section className="rounded-2xl bg-surface-bright p-6 shadow-xs border border-outline-variant/30 space-y-3">
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">install_mobile</span>
                <h3 className="text-base font-bold text-primary font-display">Install NightSafe Companion PWA</h3>
            </div>
            <p className="text-xs sm:text-sm text-on-surface-variant">
                Launch NightSafe directly from your mobile home screen with instant access, full-screen offline support, and dedicated telemetry alerts.
            </p>
            {evt ? (
                <button
                    type="button"
                    className="btn text-xs sm:w-auto px-6 h-10 mt-2"
                    onClick={() => evt.prompt()}
                >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <span>Install Application</span>
                </button>
            ) : (
                <details className="text-xs text-on-surface-variant pt-1">
                    <summary className="cursor-pointer font-semibold text-primary hover:text-on-tertiary-container transition-colors">
                        How to install on iOS or Android
                    </summary>
                    <div className="mt-2 space-y-1.5 p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono text-[11px]">
                        <p>• <strong>iPhone (Safari):</strong> Tap Share icon, then select &ldquo;Add to Home Screen&rdquo;.</p>
                        <p>• <strong>Android (Chrome):</strong> Tap the three dots menu, then select &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.</p>
                    </div>
                </details>
            )}
        </section>
    );
}
