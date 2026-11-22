import "dotenv/config";

function need(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Missing ${name} in .env`);
    return v;
}

export const config = {
    port: Number(process.env.PORT ?? 4000),
    mongoUri: need("MONGODB_URI"),
    jwtSecret: need("JWT_SECRET"),
    corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000").split(",").map((s) => s.trim()),
};