"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Device } from "@/lib/types";

type State = { loading: boolean; device: Device | null; error: string | null };

export function useDevice() {
    const { ready, session, request } = useAuth();
    const [state, setState] = useState<State>({ loading: true, device: null, error: null });

    const reload = useCallback(async () => {
        if (!ready || !session) return;
        try {
            const devices = await request<Device[]>("/devices");
            setState({ loading: false, device: devices[0] ?? null, error: null }); // one device per account
        } catch (e) {
            setState({ loading: false, device: null, error: e instanceof Error ? e.message : "Failed to load device" });
        }
    }, [ready, session, request]);

    useEffect(() => {
        if (ready && session) {
            void reload();
        } else if (ready && !session) {
            setState({ loading: false, device: null, error: null });
        }
    }, [ready, session, reload]);

    const setDevice = (device: Device) => setState((s) => ({ ...s, device }));
    return { ...state, reload, setDevice };
}
