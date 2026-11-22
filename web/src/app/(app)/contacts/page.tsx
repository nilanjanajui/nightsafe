"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useDevice } from "@/hooks/useDevice";
import { useToast } from "@/lib/toast";
import { normalizePhone } from "@/lib/format";
import { MAX_CONTACTS, RELATIONSHIPS, type Contact, type Relationship } from "@/lib/types";
import BottomSheet from "@/components/BottomSheet";
import { Icon, PageTitle, Skeleton } from "@/components/ui";

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
        request<Contact[]>("/contacts").then((c) => alive && setContacts(c)).catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load contacts"));
        return () => {
            alive = false;
        };
    }, [request]);

    async function add(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const c = await request<Contact>("/contacts", { method: "POST", body: { name, phone: normalizePhone(phone), relationship: rel } });
            setContacts((p) => [...(p ?? []), c]);
            setName("");
            setPhone("");
            toast("Contact added");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add contact");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!target) return;
        try {
            await request<void>(`/contacts/${target.id}`, { method: "DELETE" });
            setContacts((p) => (p ?? []).filter((c) => c.id !== target.id));
            toast("Contact removed");
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
            const r = await request<{ ok: boolean; notified: number }>(`/devices/${device.id}/test-sms`, { method: "POST" });
            toast(`Test message sent to ${r.notified} contact${r.notified === 1 ? "" : "s"}`);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Test failed", "error");
        } finally {
            setTesting(false);
        }
    }

    const full = (contacts?.length ?? 0) >= MAX_CONTACTS;
    return (
        <>
            <PageTitle title="Emergency contacts" sub="These people receive an SMS with your location when your device raises an urgent alert." />

            <form onSubmit={add} className="card space-y-3">
                <h2 className="font-semibold">Add a contact <span className="text-sm font-normal text-slate-500">({contacts?.length ?? 0} of {MAX_CONTACTS})</span></h2>
                <div><label className="label" htmlFor="cname">Name</label><input id="cname" className="input" required placeholder="e.g. Tariq Ahmed" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div>
                    <label className="label" htmlFor="cphone">Mobile number</label>
                    <input id="cphone" type="tel" inputMode="tel" className="input" required placeholder="01711234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <p className="mt-1 text-xs text-slate-500">Type 01XXXXXXXXX or +8801XXXXXXXXX. No app needed on their phone.</p>
                </div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Relationship">
                    {RELATIONSHIPS.map((r) => (
                        <button type="button" key={r} role="radio" aria-checked={rel === r} onClick={() => setRel(r)}
                            className={`rounded-full px-3.5 py-2 text-sm font-medium ${rel === r ? "bg-black text-white" : "bg-[var(--tint)]"}`}>{r}</button>
                    ))}
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button className="btn" disabled={busy || full}>{full ? `Limit of ${MAX_CONTACTS} reached` : busy ? "Adding..." : "Add contact"}</button>
            </form>

            {contacts === null && !error && <Skeleton className="h-20" />}
            {contacts?.length === 0 && <p className="text-slate-500">No contacts yet. Add at least one so someone is told if you need help.</p>}
            <ul className="space-y-2">
                {contacts?.map((c) => (
                    <li key={c.id} className="card flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--tint)] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{c.name} <span className="chip bg-[var(--tint)] align-middle text-slate-700">{c.relationship}</span></p>
                            <p className="text-sm text-slate-500">{c.phone}</p>
                        </div>
                        <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} className="rounded-lg bg-[var(--tint)] p-2.5"><Icon name="phone" /></a>
                        <button className="btn-danger" onClick={() => setTarget(c)} aria-label={`Remove ${c.name}`}>Remove</button>
                    </li>
                ))}
            </ul>

            <section className="card space-y-2">
                <h2 className="font-semibold">Test your setup</h2>
                <p className="text-sm text-slate-500">Sends a short test SMS from your device to every contact, so you know they'd be reached.</p>
                <button className="btn-soft" disabled={testing || !device || !contacts?.length} onClick={sendTest}>{testing ? "Sending..." : "Send test message"}</button>
            </section>

            <BottomSheet open={!!target} title={`Remove ${target?.name ?? ""}?`} onClose={() => setTarget(null)}>
                <p className="text-sm text-slate-600">They will no longer receive alert SMS messages.</p>
                <button className="btn bg-red-600" onClick={remove}>Remove</button>
                <button className="btn-soft" onClick={() => setTarget(null)}>Cancel</button>
            </BottomSheet>
        </>
    );
}