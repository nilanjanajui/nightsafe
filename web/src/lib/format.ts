import type { SmsStatus } from "./types";

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString();

export function ago(iso: string, now: number): string {
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s} s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h} h ago` : formatDateTime(iso);
}

export function dayLabel(iso: string, now: number): string {
    const d = new Date(iso);
    if (d.toDateString() === new Date(now).toDateString()) return "Today";
    if (d.toDateString() === new Date(now - 864e5).toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function uptimeLabel(sec: number): string {
    if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))} min`;
    const h = Math.floor(sec / 3600);
    return h < 48 ? `${h} h ${Math.floor((sec % 3600) / 60)} min` : `${Math.floor(h / 24)} days`;
}

// Accepts 017XXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX
export function normalizePhone(raw: string): string {
    const v = raw.replace(/[\s-]/g, "");
    if (/^01\d{9}$/.test(v)) return `+88${v}`;
    if (/^8801\d{9}$/.test(v)) return `+${v}`;
    return v;
}

export function smsLabel(a: { smsStatus: SmsStatus; notified: number | null }): string {
    switch (a.smsStatus) {
        case "sent": return a.notified ? `SMS sent to ${a.notified} contact${a.notified === 1 ? "" : "s"}` : "SMS sent";
        case "pending": return "SMS pending";
        case "failed": return "SMS failed";
        case "suppressed": return "SMS skipped (already sent for this incident)";
        case "expired": return "SMS not delivered";
        default: return "SMS status not reported";
    }
}