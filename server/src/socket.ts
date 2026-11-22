import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { Alert, Contact, Device, User, SMS_STATUSES, alertPayload } from "./db";
import { verifyToken } from "./auth";
import { config } from "./config";

let io: Server;
const deviceSockets = new Map<string, Socket>(); // one backend instance assumed
const room = (deviceId: string) => `device:${deviceId}`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// A database hiccup inside a handler must never crash the process.
const safe =
    <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
        (...a: A) => {
            fn(...a).catch((e) => console.error("socket handler error:", e));
        };

// What the Pi needs locally: threshold, owner name (for the SMS text) and who to message.
export async function buildDeviceConfig(deviceId: string) {
    const d = await Device.findById(deviceId);
    if (!d) return null;
    const owner = d.ownerId ? await User.findById(d.ownerId) : null;
    const contacts = d.ownerId ? await Contact.find({ userId: d.ownerId }).sort({ createdAt: 1 }) : [];
    return {
        bpmThreshold: d.bpmThreshold,
        ownerName: owner?.name ?? "",
        contacts: contacts.map((c) => ({ name: c.name, phone: c.phone })),
    };
}

export async function pushConfig(deviceId: string) {
    const cfg = await buildDeviceConfig(deviceId);
    if (cfg) io.of("/device").to(room(deviceId)).emit("config:update", cfg);
}

// A user who pairs while the dashboard is open starts receiving that device's events.
export function joinUserToDevice(userId: string, deviceId: string) {
    io.of("/client").in(`user:${userId}`).socketsJoin(room(deviceId));
}

export async function requestTestSms(deviceId: string): Promise<{ ok: boolean; notified: number } | "offline" | "timeout"> {
    const s = deviceSockets.get(deviceId);
    if (!s) return "offline";
    try {
        const res = await s.timeout(15000).emitWithAck("test:sms", {});
        return { ok: !!res?.ok, notified: Number(res?.notified ?? 0) };
    } catch {
        return "timeout";
    }
}

export function initSocket(server: HttpServer) {
    io = new Server(server, { cors: { origin: config.corsOrigins } });
    const deviceNs = io.of("/device");
    const clientNs = io.of("/client");

    // ---------- the Pi ----------
    deviceNs.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (typeof token !== "string") return next(new Error("missing token"));
            const device = await Device.findOne({ authToken: token });
            if (!device) return next(new Error("invalid token"));
            socket.data.deviceId = device.id;
            next();
        } catch {
            next(new Error("server error"));
        }
    });

    deviceNs.on(
        "connection",
        safe(async (socket: Socket) => {
            const deviceId = socket.data.deviceId as string;
            socket.join(room(deviceId));
            deviceSockets.set(deviceId, socket);
            await Device.updateOne({ _id: deviceId }, { isOnline: true, lastSeenAt: new Date() });
            clientNs.to(room(deviceId)).emit("device:status", { deviceId, online: true });
            await pushConfig(deviceId);

            socket.on(
                "telemetry",
                safe(async (p: any) => {
                    const now = new Date();
                    await Device.updateOne({ _id: deviceId }, { lastSeenAt: now });
                    clientNs.to(room(deviceId)).emit("telemetry", {
                        deviceId,
                        bpm: num(p?.bpm),
                        latitude: num(p?.latitude),
                        longitude: num(p?.longitude),
                        wifiSignalPct: num(p?.wifiSignalPct),
                        uptimeSec: num(p?.uptimeSec),
                        listening: typeof p?.listening === "boolean" ? p.listening : null,
                        at: now.toISOString(),
                    });
                })
            );

            socket.on(
                "alert",
                safe(async (p: any, ack?: (r: unknown) => void) => {
                    if (typeof p?.transcript !== "string" || !["HIGH", "MEDIUM"].includes(p?.priority)) {
                        ack?.({ ok: false, error: "invalid payload" });
                        return;
                    }
                    if (typeof p.clientId === "string") {
                        const dup = await Alert.findOne({ deviceId, clientId: p.clientId });
                        if (dup) {
                            ack?.({ ok: true, id: dup.id, duplicate: true });
                            return;
                        }
                    }
                    const when = p.occurredAt ? new Date(p.occurredAt) : new Date();
                    const alert = await Alert.create({
                        deviceId,
                        clientId: typeof p.clientId === "string" ? p.clientId : null,
                        transcript: p.transcript,
                        priority: p.priority,
                        bpm: num(p.bpm),
                        latitude: num(p.latitude),
                        longitude: num(p.longitude),
                        smsStatus: (SMS_STATUSES as readonly string[]).includes(p.smsStatus) ? p.smsStatus : "unknown",
                        notified: num(p.notified),
                        createdAt: isNaN(when.getTime()) ? new Date() : when,
                    });
                    clientNs.to(room(deviceId)).emit("alert", alertPayload(alert));
                    ack?.({ ok: true, id: alert.id });
                })
            );

            // The device reports how the SMS went, possibly after the alert itself was synced.
            socket.on(
                "alert:status",
                safe(async (p: any) => {
                    if (typeof p?.clientId !== "string" || !(SMS_STATUSES as readonly string[]).includes(p?.smsStatus)) return;
                    const alert = await Alert.findOneAndUpdate(
                        { deviceId, clientId: p.clientId },
                        { smsStatus: p.smsStatus, notified: num(p.notified) },
                        { new: true }
                    );
                    if (alert) clientNs.to(room(deviceId)).emit("alert:updated", alertPayload(alert));
                })
            );

            socket.on(
                "disconnect",
                safe(async () => {
                    if (deviceSockets.get(deviceId) !== socket) return; // a newer connection replaced this one
                    deviceSockets.delete(deviceId);
                    await Device.updateOne({ _id: deviceId }, { isOnline: false });
                    clientNs.to(room(deviceId)).emit("device:status", { deviceId, online: false });
                })
            );
        })
    );

    // ---------- the website ----------
    clientNs.use((socket, next) => {
        const userId = verifyToken(socket.handshake.auth?.token);
        if (!userId) return next(new Error("unauthorized"));
        socket.data.userId = userId;
        next();
    });

    clientNs.on(
        "connection",
        safe(async (socket: Socket) => {
            const userId = socket.data.userId as string;
            socket.join(`user:${userId}`);
            const devices = await Device.find({ ownerId: userId });
            for (const d of devices) {
                socket.join(room(d.id)); // only the owner's devices
                socket.emit("device:status", { deviceId: d.id, online: d.isOnline, lastSeenAt: d.lastSeenAt });
            }
        })
    );
}