import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

export const signToken = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" });

export function verifyToken(token?: string): string | null {
    if (!token) return null;
    try {
        return (jwt.verify(token, config.jwtSecret) as { sub: string }).sub;
    } catch {
        return null;
    }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const h = req.headers.authorization;
    const userId = verifyToken(h?.startsWith("Bearer ") ? h.slice(7) : undefined);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    res.locals.userId = userId;
    next();
}