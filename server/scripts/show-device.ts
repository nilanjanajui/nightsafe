import mongoose from "mongoose";
import { connectDb, Device } from "../src/db";

async function main() {
    await connectDb();
    const token = process.env.DEVICE_TOKEN;
    if (!token) {
        console.error("DEVICE_TOKEN environment variable is not set.");
        await mongoose.disconnect();
        process.exit(1);
    }
    const device = await Device.findOne({ authToken: token });
    if (!device) {
        console.log("No device found for DEVICE_TOKEN");
    } else {
        const raw = device.pairingCode;
        const formatted = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
        const owner = device.ownerId ? String(device.ownerId) : "none yet";
        console.log(`PAIRING_CODE = ${formatted} | owner: ${owner}`);
    }
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});

