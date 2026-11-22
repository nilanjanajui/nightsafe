"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/lib/socket";

export default function ConnectionStrip() {
    const { connected } = useSocket();
    const [grace, setGrace] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setGrace(false), 3000);
        return () => clearTimeout(t);
    }, []);

    if (connected || grace) return null;

    return (
        <div
            role="status"
            className="w-full bg-amber-900/90 text-amber-100 px-4 py-2 text-center text-xs font-mono font-semibold tracking-wider uppercase border-b border-amber-700/60 flex items-center justify-center gap-2"
        >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Re-establishing telemetry socket uplink...</span>
        </div>
    );
}
