import { useEffect, useState } from "react";
import { useSocket } from "@/lib/socket";
import type { AlertItem, DeviceStatus, Telemetry } from "@/lib/types";

export type Live = {
    online: boolean | null;
    bpm: number | null;
    lat: number | null;
    lng: number | null;
    at: string | null;
    wifiSignalPct: number | null;
    uptimeSec: number | null;
    listening: boolean | null;
    trend: number[];
};
const EMPTY: Live = { online: null, bpm: null, lat: null, lng: null, at: null, wifiSignalPct: null, uptimeSec: null, listening: null, trend: [] };

export function useLive(deviceId: string | undefined) {
    const { socket } = useSocket();
    const [live, setLive] = useState<Live>(EMPTY);
    const [alert, setAlert] = useState<AlertItem | null>(null);

    useEffect(() => {
        if (!deviceId) return;
        const onStatus = (s: DeviceStatus) => {
            if (s.deviceId !== deviceId) return;
            setLive((p) => ({ ...p, online: s.online, bpm: s.online ? p.bpm : null, listening: s.online ? p.listening : null }));
        };
        const onTelemetry = (t: Telemetry) => {
            if (t.deviceId !== deviceId) return;
            setLive((p) => ({
                online: true,
                bpm: t.bpm,
                lat: t.latitude ?? p.lat, // GPS can drop out: keep the last known position
                lng: t.longitude ?? p.lng,
                at: t.at,
                wifiSignalPct: t.wifiSignalPct,
                uptimeSec: t.uptimeSec,
                listening: t.listening,
                trend: t.bpm === null ? p.trend : [...p.trend, t.bpm].slice(-40),
            }));
        };
        const onAlert = (a: AlertItem) => {
            if (a.deviceId === deviceId) setAlert(a);
        };
        const onUpdated = (a: AlertItem) => setAlert((p) => (p && p.id === a.id ? a : p));
        socket.on("device:status", onStatus);
        socket.on("telemetry", onTelemetry);
        socket.on("alert", onAlert);
        socket.on("alert:updated", onUpdated);
        return () => {
            socket.off("device:status", onStatus);
            socket.off("telemetry", onTelemetry);
            socket.off("alert", onAlert);
            socket.off("alert:updated", onUpdated);
        };
    }, [socket, deviceId]);

    return { live, alert, dismissAlert: () => setAlert(null) };
}