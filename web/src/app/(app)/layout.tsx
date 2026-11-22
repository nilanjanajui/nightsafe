"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { SocketProvider } from "@/lib/socket";
import { ToastProvider } from "@/lib/toast";
import BottomNav from "@/components/BottomNav";
import ConnectionStrip from "@/components/ConnectionStrip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { ready, session } = useAuth();
    const router = useRouter();
    useEffect(() => {
        if (ready && !session) router.replace("/login");
    }, [ready, session, router]);

    if (!ready || !session) return <div className="grid min-h-dvh place-items-center text-slate-500">Loading...</div>;
    return (
        <SocketProvider key={session.token} token={session.token}>
            <ToastProvider>
                <ConnectionStrip />
                <main className="mx-auto max-w-xl space-y-4 p-4 pb-28">{children}</main>
                <BottomNav />
            </ToastProvider>
        </SocketProvider>
    );
}