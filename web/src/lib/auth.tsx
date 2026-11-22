"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { api, ApiError } from "./api";

type Session = { token: string; name: string; email: string };
type Opts = { method?: string; body?: unknown };
type AuthResult = { token: string; user: { name: string; email: string } };

type Ctx = {
    ready: boolean;
    session: Session | null;
    login: (email: string, password: string) => Promise<void>;
    signup: (name: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    request: <T>(path: string, opts?: Opts) => Promise<T>;
};

const KEY = "nightsafe.session";

let cachedRaw: string | null = "__init__";
let cachedSession: Session | null = null;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

function getSnapshot(): Session | null {
    if (typeof window === "undefined") return null;
    try {
        // One-time migration: if an old sessionStorage entry exists, move it to localStorage
        const fromSession = sessionStorage.getItem(KEY);
        if (fromSession) {
            localStorage.setItem(KEY, fromSession);
            sessionStorage.removeItem(KEY);
        }
        // Clean up legacy session cookie if present
        if (document.cookie.includes("nightsafe_sess")) {
            document.cookie = "nightsafe_sess=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
        }
    } catch {}

    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
            cachedSession = raw ? (JSON.parse(raw) as Session) : null;
        } catch {
            cachedSession = null;
        }
    }
    return cachedSession;
}

function getServerSnapshot(): undefined {
    return undefined;
}

function subscribe(callback: () => void) {
    listeners.add(callback);
    const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
            callback();
        }
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(callback);
        window.removeEventListener("storage", onStorage);
    };
}

function persistSession(session: Session | null) {
    if (typeof window === "undefined") return;
    try {
        if (session) {
            const str = JSON.stringify(session);
            cachedRaw = str;
            cachedSession = session;
            localStorage.setItem(KEY, str);
        } else {
            cachedRaw = null;
            cachedSession = null;
            localStorage.removeItem(KEY);
        }
    } catch {}
    notify();
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const rawSession = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const ready = rawSession !== undefined;
    const session = rawSession ?? null;

    const logout = useCallback(() => {
        persistSession(null);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const res = await api<AuthResult>("/auth/login", {
            method: "POST",
            body: { email, password },
        });
        const sess: Session = {
            token: res.token,
            name: res.user.name,
            email: res.user.email,
        };
        persistSession(sess);
    }, []);

    const signup = useCallback(async (name: string, email: string, password: string) => {
        const res = await api<AuthResult>("/auth/signup", {
            method: "POST",
            body: { name, email, password },
        });
        const sess: Session = {
            token: res.token,
            name: res.user.name,
            email: res.user.email,
        };
        persistSession(sess);
    }, []);

    const request = useCallback(
        async <T,>(path: string, opts: Opts = {}): Promise<T> => {
            const token = session?.token;
            if (!token) {
                throw new Error("No active authentication token");
            }
            try {
                return await api<T>(path, { ...opts, token });
            } catch (e) {
                // Only log out if a valid token was sent and rejected as unauthorized
                if (e instanceof ApiError && e.status === 401 && token) {
                    logout();
                }
                throw e;
            }
        },
        [session?.token, logout]
    );

    const value = useMemo<Ctx>(
        () => ({
            ready,
            session,
            login,
            signup,
            logout,
            request,
        }),
        [ready, session, login, signup, logout, request]
    );

    return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthCtx);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
