"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

interface AuthFormProps {
    mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
    const router = useRouter();
    const { login, signup } = useAuth();
    const toast = useToast();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const isLogin = mode === "login";

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
                toast("Logged in successfully", "ok");
            } else {
                await signup(name, email, password);
                toast("Account created successfully", "ok");
            }
            router.push("/dashboard");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Authentication failed";
            toast(message, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        {isLogin ? "Welcome back" : "Create an account"}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {isLogin
                            ? "Sign in to access your NightSafe dashboard"
                            : "Set up your account to stay protected"}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="card space-y-4">
                    {!isLogin && (
                        <div>
                            <label className="label" htmlFor="name">
                                Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Jane Doe"
                                className="input"
                                disabled={loading}
                            />
                        </div>
                    )}

                    <div>
                        <label className="label" htmlFor="email">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="input"
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <label className="label" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="input"
                            disabled={loading}
                        />
                    </div>

                    <button type="submit" disabled={loading} className="btn mt-2">
                        {loading ? "Please wait..." : isLogin ? "Sign in" : "Sign up"}
                    </button>
                </form>

                <p className="text-center text-sm text-slate-500">
                    {isLogin ? (
                        <>
                            Don&apos;t have an account?{" "}
                            <Link href="/signup" className="font-semibold text-slate-900 hover:underline">
                                Sign up
                            </Link>
                        </>
                    ) : (
                        <>
                            Already have an account?{" "}
                            <Link href="/login" className="font-semibold text-slate-900 hover:underline">
                                Log in
                            </Link>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}

