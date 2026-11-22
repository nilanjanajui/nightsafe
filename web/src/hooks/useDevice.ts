import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Device } from "@/lib/types";

type State = { loading: boolean; device: Device | null; error: string | null };

export function useDevice() {
    const { request } = useAuth();
    const [state, setState] = useState<State>({ loading: true, device: null, error: null });

    const reload = useCallback(async () => {
        try {
            const devices = await request<Device[]>("/devices");
            setState({ loading: false, device: devices[0] ?? null, error: null }); // one device per account
        } catch (e) {
            setState({ loading: false, device: null, error: e instanceof Error ? e.message : "Failed to load device" });
        }
    }, [request]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const setDevice = (device: Device) => setState((s) => ({ ...s, device }));
    return { ...state, reload, setDevice };
}