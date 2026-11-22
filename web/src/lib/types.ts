export type Device = { id: string; isOnline: boolean; lastSeenAt: string | null; bpmThreshold: number };

export const RELATIONSHIPS = ["Family", "Friend", "Neighbor", "Colleague", "Other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export const MAX_CONTACTS = 5;
export type Contact = { id: string; name: string; phone: string; relationship: Relationship };

export type SmsStatus = "unknown" | "pending" | "sent" | "failed" | "suppressed" | "expired";
export type AlertItem = {
    id: string;
    deviceId: string;
    transcript: string;
    priority: "HIGH" | "MEDIUM";
    bpm: number | null;
    latitude: number | null;
    longitude: number | null;
    smsStatus: SmsStatus;
    notified: number | null;
    createdAt: string;
};

export type Telemetry = {
    deviceId: string;
    bpm: number | null;
    latitude: number | null;
    longitude: number | null;
    wifiSignalPct: number | null;
    uptimeSec: number | null;
    listening: boolean | null;
    at: string;
};
export type DeviceStatus = { deviceId: string; online: boolean; lastSeenAt?: string | null };