"use client";

import { ArrowLeft, Check, CircleDollarSign } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { eventNetBalances, formatMoney, roundMoney } from "@/lib/domain/calculations";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";

const paymentMethods = ["Interac e-Transfer", "Cash", "PayMe", "FPS", "Bank Transfer", "Other"];

export function SettleScreen({ initialEventId }: { initialEventId?: string }) {
  const router = useRouter();
  const { snapshot, recordSettlement } = useBillMoshi();
  const firstEvent = snapshot.events.find((event) => event.id === initialEventId) ?? snapshot.events[0];
  const [scope, setScope] = useState<"current" | "selected" | "all">(initialEventId ? "current" : "selected");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(firstEvent ? [firstEvent.id] : []);
  const selectedEvents = snapshot.events.filter((event) => selectedEventIds.includes(event.id));
  const currency = selectedEvents[0]?.baseCurrency ?? "CAD";
  const compatibleEvents = snapshot.events.filter((event) => event.baseCurrency === currency);
  const userIds = useMemo(() => [...new Set(snapshot.members.filter((member) => selectedEventIds.includes(member.eventId) && member.status === "active").map((member) => member.userId))], [selectedEventIds, snapshot.members]);
  const [fromUserId, setFromUserId] = useState(() => userIds.find((id) => id !== snapshot.currentUser.id) ?? userIds[0] ?? "");
  const [toUserId, setToUserId] = useState(snapshot.currentUser.id);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  useUnsavedChanges(formDirty);

  const outstandingByEvent = selectedEvents.map((event) => {
    const fromMember = snapshot.members.find((member) => member.eventId === event.id && member.userId === fromUserId);
    const toMember = snapshot.members.find((member) => member.eventId === event.id && member.userId === toUserId);
    if (!fromMember || !toMember) return { event, outstanding: 0 };
    const balances = eventNetBalances(event.id, snapshot.members, snapshot.records, snapshot.settlements);
    return { event, outstanding: Math.max(0, Math.min(-(balances.get(fromMember.id) ?? 0), balances.get(toMember.id) ?? 0)) };
  });
  const suggested = roundMoney(outstandingByEvent.reduce((sum, item) => sum + item.outstanding, 0), currency);

  function setScopeAndEvents(next: typeof scope) {
    setFormDirty(true);
    setScope(next);
    if (next === "current" && firstEvent) setSelectedEventIds([firstEvent.id]);
    if (next === "all") setSelectedEventIds(compatibleEvents.map((event) => event.id));
  }
  function toggleEvent(eventId: string) {
    setFormDirty(true);
    setSelectedEventIds((current) => current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const payment = Number(amount);
    if (!fromUserId || !toUserId || fromUserId === toUserId) return reportError("Choose two different people.");
    if (selectedEvents.length === 0) return reportError("Select at least one Event.");
    if (payment <= 0) return reportError("Enter a payment amount.", "[name='payment-amount']");
    if (payment > suggested + 0.005) return reportError(`Payment cannot exceed the outstanding ${formatMoney(suggested, currency)}.`, "[name='payment-amount']");
    let remaining = payment;
    const allocations = outstandingByEvent.map(({ event: item, outstanding }) => { const allocatedAmount = roundMoney(Math.min(outstanding, remaining), currency); remaining = roundMoney(remaining - allocatedAmount, currency); return { eventId: item.id, allocatedAmount }; }).filter((item) => item.allocatedAmount > 0);
    const fromMember = snapshot.members.find((member) => member.userId === fromUserId && selectedEventIds.includes(member.eventId));
    const toMember = snapshot.members.find((member) => member.userId === toUserId && selectedEventIds.includes(member.eventId));
    if (!fromMember || !toMember) return reportError("Both people must belong to an included Event.");
    recordSettlement({ fromMemberId: fromMember.id, toMemberId: toMember.id, amount: payment, currency, date: new Date().toISOString(), scope, paymentMethod, note, events: allocations });
    setFormDirty(false);
    router.push(firstEvent ? `/events/${firstEvent.id}/balances` : "/");
  }
  function reportError(message: string, selector?: string) {
    setError(message);
    requestAnimationFrame(() => (selector ? document.querySelector<HTMLElement>(selector) : document.getElementById("settlement-form-error"))?.focus());
  }
  const nameFor = (userId: string) => snapshot.members.find((member) => member.userId === userId)?.name ?? userId;
  return <div className="grid gap-6"><Link href={firstEvent ? `/events/${firstEvent.id}` : "/"} className="flex w-fit items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft size={17} /> Back</Link><PageTitle eyebrow="Record a Payment" title="Settle Up" subtitle="Payments reduce balances without changing the original expenses." /><form onSubmit={submit} onChange={() => setFormDirty(true)} className="grid gap-5" noValidate><Card className="grid gap-5 p-5 sm:p-6"><div className="grid grid-cols-3 gap-2">{(["current", "selected", "all"] as const).map((option) => <button type="button" key={option} aria-pressed={scope === option} onClick={() => setScopeAndEvents(option)} className={`min-h-11 rounded-xl px-2 text-xs font-extrabold capitalize transition hover:text-ink ${scope === option ? "bg-brand text-brand-ink" : "bg-slate-50 text-muted hover:bg-brand-soft"}`}>{option === "current" ? "Current Event" : option === "selected" ? "Select Events" : "All Events"}</button>)}</div>{scope === "selected" && <div className="grid gap-2">{compatibleEvents.map((event) => { const active = selectedEventIds.includes(event.id); return <button type="button" aria-pressed={active} onClick={() => toggleEvent(event.id)} key={event.id} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-left text-sm font-bold transition hover:bg-brand-soft ${active ? "border-brand bg-brand-soft text-brand-dark" : "border-line"}`}><span>{event.emoji}</span><span className="flex-1">{event.name}</span>{active && <Check size={16} />}</button>; })}</div>}<div className="grid grid-cols-2 gap-3"><Field label="From"><select className={fieldClass} value={fromUserId} onChange={(event) => setFromUserId(event.target.value)}>{userIds.map((userId) => <option key={userId} value={userId}>{nameFor(userId)}</option>)}</select></Field><Field label="To"><select className={fieldClass} value={toUserId} onChange={(event) => setToUserId(event.target.value)}>{userIds.map((userId) => <option key={userId} value={userId}>{nameFor(userId)}</option>)}</select></Field></div><div className="rounded-2xl bg-brand-soft p-4"><p className="text-xs font-bold text-brand-dark">Outstanding for this pair</p><p className="mt-1 text-2xl font-extrabold tracking-tight">{formatMoney(suggested, currency)}</p></div><Field label="Payment amount" hint="Partial payments are supported."><input type="number" min="0" step={currency === "JPY" ? "1" : "0.01"} inputMode="decimal" className={`${fieldClass} text-xl font-extrabold`} placeholder="e.g. 42.50…" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field></Card><Card className="grid gap-5 p-5 sm:p-6"><Field label="Payment method"><select className={fieldClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></Field><Field label="Note" hint="Optional"><textarea className={`${fieldClass} py-3`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. September trip payment…" /></Field></Card>{selectedEvents.length > 0 && <Card className="overflow-hidden"><div className="border-b border-line px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-muted">Included Events</div>{outstandingByEvent.map(({ event, outstanding }) => <div className="virtual-list-item flex items-center gap-3 border-b border-line px-4 py-3 last:border-0" key={event.id}><span>{event.emoji}</span><span className="flex-1 text-sm font-bold">{event.name}</span><span className="text-sm font-extrabold">{formatMoney(outstanding, currency)}</span></div>)}</Card>}{error && <p id="settlement-form-error" role="alert" aria-live="assertive" tabIndex={-1} className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger outline-none">{error}</p>}<Button type="submit"><CircleDollarSign size={18} /> Record Payment</Button></form></div>;
}
