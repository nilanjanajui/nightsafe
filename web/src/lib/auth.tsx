"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
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

function getStoredSession(): Session | null {
    if (typeof window === "undefined") return null;
    try {
        // 1. Check sessionStorage (persists across page reloads in this tab)
        const fromSession = sessionStorage.getItem(KEY);
        if (fromSession) {
            return JSON.parse(fromSession) as Session;
        }

        // 2. Check browser session cookie (persists across tabs within current browser session)
        const match = document.cookie.match(new RegExp("(^| )nightsafe_sess=([^;]+)"));
        if (match && match[2]) {
            const parsed = JSON.parse(decodeURIComponent(match[2])) as Session;
            sessionStorage.setItem(KEY, JSON.stringify(parsed));
            return parsed;
        }

        // 3. Fallback: check legacy localStorage for seamless upgrade
        const fromLocal = localStorage.getItem(KEY);
        if (fromLocal) {
            const parsed = JSON.parse(fromLocal) as Session;
            sessionStorage.setItem(KEY, JSON.stringify(parsed));
            localStorage.removeItem(KEY);
            return parsed;
        }
    } catch {
        return null;
    }
    return null;
}

function persistSession(session: Session | null) {
    if (typeof window === "undefined") return;
    try {
        if (session) {
            const str = JSON.stringify(session);
            // Save to tab session storage
            sessionStorage.setItem(KEY, str);
            // Save to browser session cookie (no Expires/Max-Age = cleared when browser session closes)
            document.cookie = `nightsafe_sess=${encodeURIComponent(str)}; path=/; SameSite=Lax`;
            localStorage.removeItem(KEY);
        } else {
            sessionStorage.removeItem(KEY);
            localStorage.removeItem(KEY);
            document.cookie = "nightsafe_sess=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
        }
    } catch {}
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    // Synchronously check on client initialization
    const [session, setSession] = useState<Session | null>(getStoredSession);
    const [ready, setReady] = useState(false);

    // Re-verify immediately after mount
    useEffect(() => {
        const active = getStoredSession();
        setSession(active);
        setReady(true);
    }, []);

    const logout = useCallback(() => {
        persistSession(null);
        setSession(null);
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
        setSession(sess);
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
        setSession(sess);
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
                // Only log out if a valid token was sent and rejected as expired/unauthorized
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
