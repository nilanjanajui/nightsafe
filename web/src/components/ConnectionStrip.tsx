"use client";
import { useEffect, useState } from "react";
import { useSocket } from "@/lib/socket";

// About THIS phone's link to the server (not the device's). Hidden for 3 s while the first connection forms.
export default function ConnectionStrip() {
    const { connected } = useSocket();
    const [grace, setGrace] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setGrace(false), 3000);
        return () => clearTimeout(t);
    }, []);
    if (connected || grace) return null;
    return (
        <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
            Reconnecting to the server...
        </div>
    );
}