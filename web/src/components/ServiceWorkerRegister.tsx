"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
    useEffect(() => {
        // Production only: a service worker under `npm run dev` causes confusing stale pages.
        if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch((e) => console.error("SW registration failed", e));
        }
    }, []);
    return null;
}