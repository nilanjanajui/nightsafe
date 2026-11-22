"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { ready, session } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(session ? "/dashboard" : "/login");
  }, [ready, session, router]);
  return <div className="grid min-h-dvh place-items-center text-slate-500">Loading...</div>;
}