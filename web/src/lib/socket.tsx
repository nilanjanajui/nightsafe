"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

type Ctx = { socket: Socket; connected: boolean };
const SocketCtx = createContext<Ctx | null>(null);

export function useSocket() {
    const c = useContext(SocketCtx);
    if (!c) throw new Error("useSocket must be used inside SocketProvider");
    return c;
}

export function SocketProvider({ token, children }: { token: string; children: ReactNode }) {
    const [socket] = useState(() =>
        io(`${API_URL}/client`, { auth: { token }, autoConnect: false, transports: ["websocket"] })
    );
    const [connected, setConnected] = useState(false);
    useEffect(() => {
        const on = () => setConnected(true);
        const off = () => setConnected(false);
        socket.on("connect", on);
        socket.on("disconnect", off);
        socket.connect();
        return () => {
            socket.off("connect", on);
            socket.off("disconnect", off);
            socket.disconnect();
        };
    }, [socket]);
    const value = useMemo(() => ({ socket, connected }), [socket, connected]);
    return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>;
}