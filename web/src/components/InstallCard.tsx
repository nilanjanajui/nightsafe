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
        <section className="card space-y-3">
            <h2 className="font-semibold">Install NightSafe on your phone</h2>
            <p className="text-sm text-slate-500">Open it from your home screen like an app, full screen.</p>
            {evt ? (
                <button className="btn" onClick={() => evt.prompt()}>Install app</button>
            ) : (
                <details className="text-sm text-slate-600">
                    <summary className="cursor-pointer font-medium text-slate-900">How to install</summary>
                    <p className="mt-2">iPhone (Safari): tap Share, then Add to Home Screen.</p>
                    <p>Android (Chrome): open the menu, then Install app.</p>
                </details>
            )}
        </section>
    );
}