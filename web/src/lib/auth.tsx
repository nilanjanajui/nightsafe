"use client";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
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
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(cb: () => void) {
    listeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
    };
}
const getSnapshot = () => localStorage.getItem(KEY);
const getServerSnapshot = (): string | null | undefined => undefined; // undefined = not hydrated yet

function save(r: AuthResult) {
    localStorage.setItem(KEY, JSON.stringify({ token: r.token, name: r.user.name, email: r.user.email }));
    emit();
}
const logout = () => {
    localStorage.removeItem(KEY);
    emit();
};
const login = async (email: string, password: string) =>
    save(await api<AuthResult>("/auth/login", { method: "POST", body: { email, password } }));
const signup = async (name: string, email: string, password: string) =>
    save(await api<AuthResult>("/auth/signup", { method: "POST", body: { name, email, password } }));

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const raw = useSyncExternalStore<string | null | undefined>(subscribe, getSnapshot, getServerSnapshot);
    const session = useMemo<Session | null>(() => {
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Session;
        } catch {
            return null;
        }
    }, [raw]);

    const value = useMemo<Ctx>(
        () => ({
            ready: raw !== undefined,
            session,
            login,
            signup,
            logout,
            // Every call carries the token; an expired token (401) signs the user out.
            request: async <T,>(path: string, opts: Opts = {}) => {
                try {
                    return await api<T>(path, { ...opts, token: session?.token });
                } catch (e) {
                    if (e instanceof ApiError && e.status === 401) logout();
                    throw e;
                }
            },
        }),
        [raw, session]
    );
    return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthCtx);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}