import crypto from "crypto";
import mongoose from "mongoose";
import { connectDb, Device } from "../src/db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
const code = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

async function main() {
    await connectDb();
    const pairingCode = code();
    const device = await Device.create({ authToken: crypto.randomBytes(24).toString("hex"), pairingCode });
    console.log("DEVICE_TOKEN =", device.authToken);
    console.log("PAIRING_CODE =", `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`);
    await mongoose.disconnect();
}
main();