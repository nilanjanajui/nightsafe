import mongoose, { Schema } from "mongoose";
import { config } from "./config";

export const RELATIONSHIPS = ["Family", "Friend", "Neighbor", "Colleague", "Other"] as const;
export const SMS_STATUSES = ["unknown", "pending", "sent", "failed", "suppressed", "expired"] as const;
export const MAX_CONTACTS = 5;

// JSON output: `id` instead of `_id`/`__v`; secrets never leave the server.
const json = (hide: string[] = []) => ({
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, any>) => {
        ret.id = String(ret._id);
        delete ret._id;
        for (const k of hide) delete ret[k];
        return ret;
    },
});
const created = { timestamps: { createdAt: true, updatedAt: false } };

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true },
        passwordHash: { type: String, required: true },
    },
    { ...created, toJSON: json(["passwordHash"]) }
);

const deviceSchema = new Schema(
    {
        authToken: { type: String, required: true, unique: true }, // secret, lives in the Pi's .env
        pairingCode: { type: String, required: true, unique: true }, // printed on the device sticker
        ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        isOnline: { type: Boolean, default: false },
        lastSeenAt: { type: Date, default: null },
        bpmThreshold: { type: Number, default: 100 },
    },
    { ...created, toJSON: json(["authToken", "pairingCode"]) }
);

const contactSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relationship: { type: String, enum: [...RELATIONSHIPS], default: "Other" },
    },
    { ...created, toJSON: json() }
);

const alertSchema = new Schema(
    {
        deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
        clientId: { type: String, default: null, index: true }, // device-made id: resends are ignored
        transcript: { type: String, required: true },
        priority: { type: String, enum: ["HIGH", "MEDIUM"], required: true },
        bpm: { type: Number, default: null },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        smsStatus: { type: String, enum: [...SMS_STATUSES], default: "unknown" },
        notified: { type: Number, default: null }, // how many contacts the SMS reached
        createdAt: { type: Date, default: Date.now }, // settable so alerts queued offline keep their real time
    },
    { toJSON: json() }
);
alertSchema.index({ deviceId: 1, createdAt: -1 });

export const User = mongoose.model("User", userSchema);
export const Device = mongoose.model("Device", deviceSchema);
export const Contact = mongoose.model("Contact", contactSchema);
export const Alert = mongoose.model("Alert", alertSchema);

// One plain shape for alerts, used by REST and sockets (ObjectIds don't serialize reliably over sockets).
export const alertPayload = (a: InstanceType<typeof Alert>) => ({
    id: a.id as string,
    deviceId: String(a.deviceId),
    transcript: a.transcript,
    priority: a.priority,
    bpm: a.bpm ?? null,
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
    smsStatus: a.smsStatus,
    notified: a.notified ?? null,
    createdAt: a.createdAt.toISOString(),
});

export async function connectDb() {
    await mongoose.connect(config.mongoUri);
    await Promise.all([User.init(), Device.init(), Contact.init(), Alert.init()]); // build indexes first
}