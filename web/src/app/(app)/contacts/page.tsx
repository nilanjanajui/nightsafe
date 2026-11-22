"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { useToast } from "@/lib/toast";
import { normalizePhone } from "@/lib/format";
import { MAX_CONTACTS, RELATIONSHIPS, type Contact, type Relationship } from "@/lib/types";
import BottomSheet from "@/components/BottomSheet";
import { Icon, Skeleton } from "@/components/ui";

export default function ContactsPage() {
    const { request } = useAuth();
    const toast = useToast();
    const { device } = useDevice();
    const [contacts, setContacts] = useState<Contact[] | null>(null);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [rel, setRel] = useState<Relationship>("Family");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [target, setTarget] = useState<Contact | null>(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        let alive = true;
        request<Contact[]>("/contacts")
            .then((c) => alive && setContacts(c))
            .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load contacts"));
        return () => {
            alive = false;
        };
    }, [request]);

    async function add(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const c = await request<Contact>("/contacts", {
                method: "POST",
                body: { name, phone: normalizePhone(phone), relationship: rel },
            });
            setContacts((p) => [...(p ?? []), c]);
            setName("");
            setPhone("");
            toast("Recipient registered to safety circle", "ok");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add contact");
            toast(err instanceof Error ? err.message : "Failed to add contact", "error");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!target) return;
        try {
            await request<void>(`/contacts/${target.id}`, { method: "DELETE" });
            setContacts((p) => (p ?? []).filter((c) => c.id !== target.id));
            toast("Contact removed from alert stream", "ok");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not remove contact", "error");
        } finally {
            setTarget(null);
        }
    }

    async function sendTest() {
        if (!device) return;
        setTesting(true);
        try {
            const r = await request<{ ok: boolean; notified: number }>(`/devices/${device.id}/test-sms`, {
                method: "POST",
            });
            toast(`Test broadcast dispatched to ${r.notified} recipient${r.notified === 1 ? "" : "s"}`, "ok");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Broadcast test failed", "error");
        } finally {
            setTesting(false);
        }
    }

    const count = contacts?.length ?? 0;
    const full = count >= MAX_CONTACTS;

    return (
        <div className="space-y-8">
            {/* PAGE HEADER */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-ping" />
                        <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-widest font-semibold">
                            Safety Circle
                        </span>
                    </div>
                    <h1 className="font-headline-lg text-headline-lg text-primary font-bold tracking-tight uppercase">
                        Your Safety Circle
                    </h1>
                    <p className="text-xs sm:text-sm text-on-surface-variant max-w-xl">
                        People NightSafe immediately reaches via SMS and live location when you need help.
                    </p>
                </div>

                <div className="flex flex-col sm:items-end gap-2">
                    <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 shadow-xs">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                            Capacity
                        </span>
                        <div className="h-3 w-[1px] bg-outline-variant/60" />
                        <span className="font-mono font-bold text-xs text-primary">
                            {count} / {MAX_CONTACTS} Registered
                        </span>
                    </div>
                </div>
            </header>

            {/* TOP ALERT PATH BANNER */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="relative overflow-hidden rounded-2xl bg-surface-container p-6 shadow-xs border border-outline-variant/30"
            >
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-1.5 max-w-2xl">
                        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider font-mono">
                            <span className="material-symbols-outlined text-[18px] text-on-tertiary-container">
                                cell_tower
                            </span>
                            <span>Test Your Alert Path</span>
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-primary font-display">
                            Make sure your contacts can actually receive critical messages from the device.
                        </h2>
                        <p className="text-xs sm:text-sm text-on-surface-variant">
                            SMS alerts are sent via the Textbee API through a linked Android phone over the internet.
                        </p>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={sendTest}
                            disabled={testing || !device || count === 0}
                            className="btn h-11 px-5 w-auto text-xs"
                        >
                            <span className="material-symbols-outlined text-[16px]">satellite_alt</span>
                            <span>{testing ? "Dispatching SMS..." : "Send Test Message"}</span>
                        </button>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-surface text-on-surface-variant font-mono text-[11px] border border-outline-variant/20">
                            <span className="text-on-tertiary-container font-bold">✓</span>
                            <span>Sent via Textbee (internet)</span>
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* TWO-COLUMN WORKSPACE: CONTACTS LIST & ADD CONTACT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT COLUMN: Registered Contacts Stream (Span 7) */}
                <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center justify-between pb-1">
                        <h3 className="font-mono text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                            Active Recipients Stream
                        </h3>
                        <span className="font-mono text-[11px] text-on-surface-variant">
                            Priority Sequential Relay
                        </span>
                    </div>

                    {contacts === null && !error && (
                        <div className="space-y-3">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    )}

                    {contacts && contacts.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-outline-variant/60 bg-surface-bright p-8 text-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mx-auto text-on-surface-variant">
                                <span className="material-symbols-outlined text-2xl">group_add</span>
                            </div>
                            <h4 className="text-base font-bold text-primary font-display">Safety Circle is Empty</h4>
                            <p className="text-xs sm:text-sm text-on-surface-variant max-w-sm mx-auto">
                                No emergency contacts added yet. Register trusted family or friends using the form so NightSafe can broadcast your location under distress.
                            </p>
                        </div>
                    )}

                    <ul className="space-y-3">
                        <AnimatePresence>
                            {contacts?.map((c, idx) => (
                                <motion.li
                                    key={c.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.92 }}
                                    transition={{ duration: 0.2 }}
                                    whileHover={{ y: -2 }}
                                    className="p-4 sm:p-5 rounded-2xl bg-surface-bright shadow-xs border border-outline-variant/30 flex items-center justify-between gap-4 transition-all hover:border-outline-variant"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        {/* Monogram Avatar */}
                                        <div className="w-11 h-11 rounded-full bg-primary-container text-tertiary-fixed-dim flex items-center justify-center shrink-0 font-bold font-display text-sm relative shadow-xs">
                                            {c.name.slice(0, 1).toUpperCase()}
                                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-surface-bright flex items-center justify-center">
                                                <span className="w-2 h-2 rounded-full bg-on-tertiary-container" />
                                            </span>
                                        </div>

                                        <div className="space-y-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="text-sm font-bold text-primary truncate font-display">
                                                    {c.name}
                                                </h4>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-container text-secondary font-mono">
                                                    {c.relationship} {idx === 0 ? "· Primary" : ""}
                                                </span>
                                            </div>
                                            <p className="font-mono text-xs text-on-surface tracking-wider">
                                                {c.phone}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                                                <span className="text-on-tertiary-container font-bold">✓</span>
                                                <span>SMS alerts enabled</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <a
                                            href={`tel:${c.phone}`}
                                            aria-label={`Call ${c.name}`}
                                            className="p-2 rounded-lg bg-surface-container text-primary hover:bg-surface-container-high transition-colors"
                                        >
                                            <Icon name="phone" className="h-4 w-4" />
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setTarget(c)}
                                            className="btn-danger text-xs px-2.5 py-1.5"
                                            aria-label={`Remove ${c.name}`}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                </div>

                {/* RIGHT COLUMN: Provision New Contact Form (Span 5) */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1 }}
                    className="lg:col-span-5"
                >
                    <form onSubmit={add} className="card rounded-2xl bg-surface-bright border border-outline-variant/30 p-6 space-y-4">
                        <div>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-bold block mb-1">
                                Provision Member
                            </span>
                            <h3 className="text-lg font-bold text-primary font-display">
                                Add to Safety Circle
                            </h3>
                            <p className="text-xs text-on-surface-variant mt-0.5">
                                Enter a trusted contact with active cellular phone reception.
                            </p>
                        </div>

                        {error && (
                            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                                {error}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="label" htmlFor="cname">
                                Full Name
                            </label>
                            <input
                                id="cname"
                                className="input h-10"
                                required
                                placeholder="e.g. Tariq Ahmed"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={busy || full}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="label" htmlFor="cphone">
                                Mobile Number
                            </label>
                            <input
                                id="cphone"
                                type="tel"
                                inputMode="tel"
                                className="input h-10 font-mono text-sm"
                                required
                                placeholder="01711234567"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                disabled={busy || full}
                            />
                            <p className="text-[11px] text-on-surface-variant font-mono">
                                e.g. 01XXXXXXXXX or +8801XXXXXXXXX. No app required on their phone.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="label">Relationship</label>
                            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Relationship">
                                {RELATIONSHIPS.map((r) => (
                                    <button
                                        type="button"
                                        key={r}
                                        role="radio"
                                        aria-checked={rel === r}
                                        onClick={() => setRel(r)}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition-all ${
                                            rel === r
                                                ? "bg-primary-container text-surface-bright shadow-xs font-bold"
                                                : "bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                                        }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn h-11 mt-2 text-xs"
                            disabled={busy || full}
                        >
                            {full
                                ? `Capacity Limit (${MAX_CONTACTS}) Reached`
                                : busy
                                ? "Registering Recipient..."
                                : "Register Contact"}
                        </button>
                    </form>
                </motion.div>
            </div>

            {/* REMOVE CONTACT CONFIRMATION SHEET */}
            <BottomSheet
                open={!!target}
                title={`Remove ${target?.name ?? "contact"}?`}
                onClose={() => setTarget(null)}
            >
                <div className="space-y-4">
                    <p className="text-xs sm:text-sm text-on-surface-variant">
                        This person will be immediately de-provisioned from the cellular SMS broadcast matrix. They will not receive distress alerts or coordinates if your device triggers.
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                        <button type="button" className="btn bg-red-600 hover:bg-red-700 text-white" onClick={remove}>
                            Confirm Removal
                        </button>
                        <button type="button" className="btn-soft" onClick={() => setTarget(null)}>
                            Cancel
                        </button>
                    </div>
                </div>
            </BottomSheet>
        </div>
    );
}
