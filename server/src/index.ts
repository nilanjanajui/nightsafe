import express from "express";
import cors from "cors";
import http from "http";
import { config } from "./config";
import router from "./routes";
import { initSocket } from "./socket";
import { connectDb, Device } from "./db";

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

const app = express();
app.set("trust proxy", 1); // behind Railway/Render, so rate limits see real client IPs
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use(router);

const server = http.createServer(app);
initSocket(server);

connectDb()
    .then(() => Device.updateMany({}, { isOnline: false })) // a restart drops every socket
    .then(() => server.listen(config.port, () => console.log(`NightSafe API on :${config.port}`)))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });