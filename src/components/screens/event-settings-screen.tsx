"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";

export function EventSettingsScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { snapshot, updateEvent, deleteEvent } = useBillMoshi();
  const event = snapshot.events.find((item) => item.id === eventId);
  const [name, setName] = useState(event?.name ?? "");
  const [emoji, setEmoji] = useState(event?.emoji ?? "🧳");
  const [currency, setCurrency] = useState<CurrencyCode>(event?.baseCurrency ?? "CAD");
  const [startDate, setStartDate] = useState(event?.startDate ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  if (!event) return <p>Event not found.</p>;
  const currentEvent = event;
  const isOwner = event.ownerId === snapshot.currentUser.id;
  function save(formEvent: FormEvent) { formEvent.preventDefault(); updateEvent(eventId, { name, emoji, baseCurrency: currency, startDate: startDate || undefined, endDate: endDate || undefined }); router.push(`/events/${eventId}`); }
  function remove() { if (!window.confirm(`Delete “${currentEvent.name}” and all of its local records?`)) return; deleteEvent(eventId); router.push(`/groups/${currentEvent.groupId}`); }
  return <div className="grid gap-6 animate-rise"><Link href={`/events/${eventId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {event.name}</Link><PageTitle eyebrow="Owner controls" title="Event settings" subtitle="Rename the event, change dates, or update its base currency." />{!isOwner ? <Card className="p-6 text-sm text-muted">Only the event owner can change these settings.</Card> : <form onSubmit={save} className="grid gap-5"><Card className="grid gap-5 p-5 sm:p-6"><div className="grid grid-cols-[90px_1fr] gap-3"><Field label="Icon"><input className={`${fieldClass} text-center text-xl`} value={emoji} onChange={(event) => setEmoji(event.target.value)} /></Field><Field label="Name"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} /></Field></div><Field label="Base currency" hint="Existing expenses keep their original and stored base values."><select className={fieldClass} value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Starts"><input type="date" className={fieldClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field><Field label="Ends"><input type="date" className={fieldClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field></div></Card><Button type="submit">Save settings</Button><Card className="border-danger/20 p-5"><h2 className="font-extrabold text-danger">Danger zone</h2><p className="mt-1 text-sm leading-6 text-muted">Deleting removes this event from Bill Moshi. Google sync clears its event row; exported files and historical Drive content may remain recoverable.</p><Button type="button" variant="danger" className="mt-4" onClick={remove}><Trash2 size={17} /> Delete event</Button></Card></form>}</div>;
}
