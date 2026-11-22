import "dotenv/config";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";

const URL = process.env.BACKEND_URL ?? "http://localhost:4000";
const TOKEN = process.env.DEVICE_TOKEN;
if (!TOKEN) {
    console.error("Set DEVICE_TOKEN (printed by `npm run seed`)");
    process.exit(1);
}

const state = { bpm: 80, lat: 22.3569, lng: 91.7832, threshold: 100 }; // central Chittagong
const startedAt = Date.now();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const socket = io(`${URL}/device`, { auth: { token: TOKEN }, transports: ["websocket"], reconnectionDelayMax: 10000 });
socket.on("connect", () => console.log("connected"));
socket.on("disconnect", (r) => console.log("disconnected:", r));
socket.on("connect_error", (e) => console.log("connect error:", e.message));
socket.on("config:update", (cfg) => {
    state.threshold = cfg.bpmThreshold;
    console.log("config:", JSON.stringify(cfg));
});
socket.on("test:sms", (_p, ack) => {
    console.log("test SMS requested");
    ack({ ok: true, notified: 1 });
});

setInterval(() => {
    if (!socket.connected) return;
    state.bpm = Math.min(125, Math.max(62, state.bpm + rand(-4, 4)));
    state.lat += rand(-0.0003, 0.0003);
    state.lng += rand(-0.0003, 0.0003);
    socket.emit("telemetry", {
        bpm: Math.round(state.bpm),
        latitude: state.lat,
        longitude: state.lng,
        wifiSignalPct: Math.round(rand(60, 85)),
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        listening: true,
    });
}, 3000);

function sendAlert() {
    const payload = {
        transcript: "আমাকে বাঁচাও",
        priority: state.bpm >= state.threshold ? "HIGH" : "MEDIUM",
        bpm: Math.round(state.bpm),
        latitude: state.lat,
        longitude: state.lng,
        occurredAt: new Date().toISOString(),
        clientId: randomUUID(),
        smsStatus: "sent",
        notified: 3,
    };
    socket.timeout(5000).emit("alert", payload, (err: Error | null, res: unknown) =>
        console.log(err ? "no ack from server" : "alert ack:", res ?? "")
    );
}

console.log("Type 'a' + Enter to send a fake alert, 'q' to quit");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
    if (line.trim() === "a") sendAlert();
    if (line.trim() === "q") process.exit(0);
});