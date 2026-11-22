import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { isValidObjectId } from "mongoose";
import { Alert, Contact, Device, User, MAX_CONTACTS, RELATIONSHIPS, alertPayload } from "./db";
import { requireAuth, signToken } from "./auth";
import { joinUserToDevice, pushConfig, requestTestSms } from "./socket";

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });
const PHONE = /^\+[1-9]\d{7,14}$/; // E.164, e.g. +8801XXXXXXXXX

const fail = (res: Response, code: number, error: string): void => {
    res.status(code).json({ error });
};

async function pushConfigForUser(userId: string) {
    const devices = await Device.find({ ownerId: userId });
    await Promise.all(devices.map((d) => pushConfig(d.id)));
}

const ownedDevice = async (userId: string, deviceId: string) =>
    isValidObjectId(deviceId) && (await Device.exists({ _id: deviceId, ownerId: userId }));

// ---------- Auth ----------
router.post("/auth/signup", limiter, async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (
        typeof name !== "string" || name.trim().length < 2 ||
        typeof email !== "string" || !email.includes("@") ||
        typeof password !== "string" || password.length < 8
    ) {
        return fail(res, 400, "A name, a valid email and a password of 8+ characters are required");
    }
    try {
        const user = await User.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            passwordHash: await bcrypt.hash(password, 10),
        });
        res.status(201).json({ token: signToken(user.id), user: { id: user.id, name: user.name, email: user.email } });
    } catch (e: any) {
        if (e?.code === 11000) return fail(res, 409, "That email is already registered");
        throw e;
    }
});

router.post("/auth/login", limiter, async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = typeof email === "string" ? await User.findOne({ email: email.trim().toLowerCase() }) : null;
    if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
        return fail(res, 401, "Incorrect email or password");
    }
    res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, email: user.email } });
});

// ---------- Devices ----------
router.get("/devices", requireAuth, async (_req, res) => {
    res.json(await Device.find({ ownerId: res.locals.userId }).select("isOnline lastSeenAt bpmThreshold"));
});

router.post("/devices/pair", requireAuth, limiter, async (req, res) => {
    const code = String(req.body?.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const userId = res.locals.userId as string;
    if (code.length !== 8) return fail(res, 400, "Enter the 8-character code from the sticker");
    const device = await Device.findOne({ pairingCode: code });
    if (!device) return fail(res, 404, "That code wasn't found. Check the sticker and try again");
    if (String(device.ownerId) === userId) {
        res.json({ id: device.id });
        return;
    }
    // Atomic claim: succeeds only while nobody owns the device.
    const claimed = await Device.findOneAndUpdate({ _id: device._id, ownerId: null }, { ownerId: userId });
    if (!claimed) return fail(res, 409, "This device is already linked to another account");
    joinUserToDevice(userId, device.id);
    await pushConfig(device.id);
    res.json({ id: device.id });
});

router.get("/devices/:id/alerts", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    if (!(await ownedDevice(res.locals.userId, id))) return fail(res, 404, "Device not found");
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
    const filter: Record<string, any> = { deviceId: id };
    if (req.query.priority === "HIGH" || req.query.priority === "MEDIUM") filter.priority = req.query.priority;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    if (cursor && isValidObjectId(cursor)) {
        const c = await Alert.findOne({ _id: cursor, deviceId: id });
        if (c) filter.$or = [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c._id } }];
    }
    const rows = await Alert.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
    const items = rows.slice(0, limit);
    res.json({ items: items.map(alertPayload), nextCursor: rows.length > limit ? items[items.length - 1].id : null });
});

router.patch("/devices/:id/settings", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const t = req.body?.bpmThreshold;
    if (!Number.isInteger(t) || t < 40 || t > 200) return fail(res, 400, "bpmThreshold must be an integer between 40 and 200");
    if (!isValidObjectId(id)) return fail(res, 404, "Device not found");
    const device = await Device.findOneAndUpdate({ _id: id, ownerId: res.locals.userId }, { bpmThreshold: t }, { new: true });
    if (!device) return fail(res, 404, "Device not found");
    await pushConfig(id);
    res.json({ id: device.id, bpmThreshold: device.bpmThreshold });
});

router.post("/devices/:id/test-sms", requireAuth, limiter, async (req, res) => {
    const id = String(req.params.id);
    if (!(await ownedDevice(res.locals.userId, id))) return fail(res, 404, "Device not found");
    const r = await requestTestSms(id);
    if (r === "offline") return fail(res, 409, "Your device is offline");
    if (r === "timeout") return fail(res, 504, "The device didn't respond. It may need an update to support test messages");
    if (!r.ok) return fail(res, 502, "The device couldn't send the test message");
    res.json({ ok: true, notified: r.notified });
});

// ---------- Contacts ----------
router.get("/contacts", requireAuth, async (_req, res) => {
    res.json(await Contact.find({ userId: res.locals.userId }).sort({ createdAt: 1 }));
});

router.post("/contacts", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { name, phone, relationship } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || typeof phone !== "string" || !PHONE.test(phone.trim())) {
        return fail(res, 400, "A name and a phone number in +880... format are required");
    }
    const rel = (RELATIONSHIPS as readonly string[]).includes(relationship) ? relationship : "Other";
    if ((await Contact.countDocuments({ userId })) >= MAX_CONTACTS) return fail(res, 409, `You can add up to ${MAX_CONTACTS} contacts`);
    if (await Contact.exists({ userId, phone: phone.trim() })) return fail(res, 409, "This number is already saved");
    const contact = await Contact.create({ userId, name: name.trim(), phone: phone.trim(), relationship: rel });
    await pushConfigForUser(userId);
    res.status(201).json(contact);
});

router.delete("/contacts/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const r = isValidObjectId(id) ? await Contact.deleteOne({ _id: id, userId: res.locals.userId }) : null;
    if (!r || r.deletedCount === 0) return fail(res, 404, "Contact not found");
    await pushConfigForUser(res.locals.userId);
    res.status(204).end();
});

export default router;