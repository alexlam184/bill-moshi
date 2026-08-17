"use client";

import { ArrowLeft, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export function EventSettingsScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { snapshot, updateEvent, deleteEvent } = useBillMoshi();
  const event = snapshot.events.find((item) => item.id === eventId);
  const [name, setName] = useState(event?.name ?? "");
  const [emoji, setEmoji] = useState(event?.emoji ?? "🧳");
  const [currency, setCurrency] = useState<CurrencyCode>(event?.baseCurrency ?? "CAD");
  const [startDate, setStartDate] = useState(event?.startDate ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"name" | "ends">();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteDialogRef = useDialogFocus<HTMLElement>(() => setDeleteOpen(false), deleteOpen);
  const dirty = Boolean(event && (
    name !== event.name
    || emoji !== event.emoji
    || currency !== event.baseCurrency
    || startDate !== (event.startDate ?? "")
    || endDate !== (event.endDate ?? "")
  ));
  useUnsavedChanges(dirty);

  if (!event) return <p>Event not found.</p>;
  const currentEvent = event;
  const isOwner = event.ownerId === snapshot.currentUser.id;

  function save(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!name.trim()) return reportError("Give the Event a name.", "name");
    if (startDate && endDate && endDate < startDate) return reportError("End date must be after the start date.", "ends");
    updateEvent(eventId, { name: name.trim(), emoji, baseCurrency: currency, startDate: startDate || undefined, endDate: endDate || undefined });
    router.push(`/events/${eventId}`);
  }

  function reportError(message: string, field: "name" | "ends") {
    setError(message);
    setErrorField(field);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`input[name='${field}']`)?.focus());
  }

  function remove() {
    deleteEvent(eventId);
    setDeleteOpen(false);
    router.push(`/groups/${currentEvent.groupId}`);
  }

  return <div className="grid gap-6">
    <Link href={`/events/${eventId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft size={17} /> {event.name}</Link>
    <PageTitle eyebrow="Owner Controls" title="Event Settings" subtitle="Rename the Event, change dates, or update its base currency." />
    {!isOwner ? <Card className="p-6 text-sm text-muted">Only the Event owner can change these settings.</Card> : <form onSubmit={save} className="grid gap-5" noValidate>
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="grid grid-cols-[90px_1fr] gap-3">
          <Field label="Icon"><input className={`${fieldClass} text-center text-xl`} value={emoji} onChange={(changeEvent) => setEmoji(changeEvent.target.value)} /></Field>
          <Field label="Name" error={errorField === "name" ? error : undefined}><input className={fieldClass} value={name} onChange={(changeEvent) => { setName(changeEvent.target.value); setErrorField(undefined); }} /></Field>
        </div>
        <Field label="Base currency" hint="Existing expenses keep their original and stored base values."><select className={fieldClass} value={currency} onChange={(changeEvent) => setCurrency(changeEvent.target.value as CurrencyCode)}>{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts"><input type="date" className={fieldClass} value={startDate} onChange={(changeEvent) => { setStartDate(changeEvent.target.value); setErrorField(undefined); }} /></Field>
          <Field label="Ends" error={errorField === "ends" ? error : undefined}><input type="date" className={fieldClass} value={endDate} min={startDate} onChange={(changeEvent) => { setEndDate(changeEvent.target.value); setErrorField(undefined); }} /></Field>
        </div>
      </Card>
      <Button type="submit">Save Settings</Button>
      <Card className="border-danger/20 p-5"><h2 className="font-extrabold text-danger">Danger Zone</h2><p className="mt-1 text-sm leading-6 text-muted">Deleting removes this Event from Bill Moshi. Google sync clears its Event row; exported files and historical Drive content may remain recoverable.</p><Button type="button" variant="danger" className="mt-4" onClick={() => setDeleteOpen(true)}><Trash2 size={17} /> Delete Event</Button></Card>
    </form>}
    {deleteOpen && <div className="animate-overlay-fade fixed inset-0 z-[80] grid items-end overscroll-contain bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="delete-event-title">
      <button type="button" className="absolute inset-0" aria-label="Cancel deleting event" onClick={() => setDeleteOpen(false)} />
      <section ref={deleteDialogRef} className="animate-sheet-in safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-danger">Permanent Action</p><h2 id="delete-event-title" className="mt-1 text-xl font-extrabold tracking-tight">Delete <strong>&quot;{currentEvent.name}&quot;</strong>?</h2></div><button type="button" onClick={() => setDeleteOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close"><X size={20} /></button></div>
        <p className="mt-5 rounded-xl bg-danger-soft p-4 text-sm leading-6 text-ink">This removes the Event and its local records. This action cannot be undone.</p>
        <div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button type="button" variant="danger" onClick={remove}><Trash2 size={16} /> Delete Event</Button></div>
      </section>
    </div>}
  </div>;
}
