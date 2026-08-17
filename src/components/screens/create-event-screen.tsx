"use client";

import { ArrowLeft, CalendarDays, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";

const emojiOptions = ["🧳", "🇨🇦", "🇯🇵", "🍽️", "🎓", "🎉", "🏕️", "⚽"];

export function CreateEventScreen({ initialGroupId }: { initialGroupId?: string }) {
  const router = useRouter();
  const { snapshot, createEvent } = useBillMoshi();
  const defaultGroupId = initialGroupId ?? snapshot.groups[0]?.id ?? "";
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🧳");
  const [currency, setCurrency] = useState<CurrencyCode>(snapshot.groups.find((group) => group.id === defaultGroupId)?.currency ?? snapshot.currentUser.defaultCurrency);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"group" | "name" | "dates">();
  const dirty = Boolean(name || startDate || endDate || emoji !== "🧳" || groupId !== defaultGroupId || currency !== (snapshot.groups.find((group) => group.id === defaultGroupId)?.currency ?? snapshot.currentUser.defaultCurrency));
  useUnsavedChanges(dirty);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!groupId) return reportError("Choose a Group for this Event.", "group");
    if (!name.trim()) return reportError("Give your Event a name.", "name");
    if (startDate && endDate && endDate < startDate) return reportError("End date must be after the start date.", "dates");
    const eventId = createEvent({ groupId, name, emoji, baseCurrency: currency, startDate: startDate || undefined, endDate: endDate || undefined });
    router.push(`/events/${eventId}`);
  }

  function reportError(message: string, field: "group" | "name" | "dates") {
    setError(message);
    setErrorField(field);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[name='${field === "dates" ? "ends" : field === "name" ? "event-name" : "group"}']`)?.focus());
  }

  if (snapshot.groups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-extrabold">Create a group first</h1>
        <p className="mt-2 text-sm text-muted">Every event belongs to a family, roommate, friend, or team group.</p>
        <Link href="/groups/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-ink">Create group</Link>
      </Card>
    );
  }

  const backHref = groupId ? `/groups/${groupId}` : "/";

  return (
    <div className="grid gap-6">
      <Link href={backHref} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> Group</Link>
      <PageTitle eyebrow="New Event" title="Create an Event" subtitle="A specific trip, dinner, or activity inside one of your Groups." />
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><UsersRound size={19} /></span>
            <div><h2 className="font-extrabold">Parent group</h2><p className="text-xs text-muted">The hamburger menu switches between these groups.</p></div>
          </div>
          <Field label="Group" error={errorField === "group" ? error : undefined}>
            <select className={fieldClass} value={groupId} onChange={(event) => { const nextGroupId = event.target.value; setGroupId(nextGroupId); setCurrency(snapshot.groups.find((group) => group.id === nextGroupId)?.currency ?? snapshot.currentUser.defaultCurrency); setError(""); setErrorField(undefined); }}>
              {snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>)}
            </select>
          </Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <Field label="Event name" error={errorField === "name" ? error : undefined}>
            <input className={fieldClass} placeholder="e.g. 2026 Toronto Trip…" value={name} onChange={(event) => { setName(event.target.value); setError(""); setErrorField(undefined); }} />
          </Field>
          <Field label="Choose an icon">
            <div className="grid grid-cols-8 gap-2">
              {emojiOptions.map((option) => <button key={option} type="button" aria-pressed={emoji === option} onClick={() => setEmoji(option)} className={`grid aspect-square place-items-center rounded-xl text-xl transition ${emoji === option ? "bg-brand ring-2 ring-brand-dark/20" : "bg-slate-50 hover:bg-brand-soft"}`} aria-label={`Use ${option}`}>{option}</button>)}
            </div>
          </Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><WalletCards size={19} /></span><div><h2 className="font-extrabold">Money</h2><p className="text-xs text-muted">Balances are calculated in this currency.</p></div></div>
          <Field label="Base currency"><select className={fieldClass} value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code} — {code === "CAD" ? "Canadian Dollar" : code === "HKD" ? "Hong Kong Dollar" : "Japanese Yen"}</option>)}</select></Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><CalendarDays size={19} /></span><div><h2 className="font-extrabold">Dates</h2><p className="text-xs text-muted">Optional — useful for trips and activities.</p></div></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Starts"><input type="date" className={fieldClass} value={startDate} onChange={(event) => { setStartDate(event.target.value); setErrorField(undefined); }} /></Field><Field label="Ends" error={errorField === "dates" ? error : undefined}><input type="date" className={fieldClass} value={endDate} min={startDate} onChange={(event) => { setEndDate(event.target.value); setErrorField(undefined); }} /></Field></div>
        </Card>
        <Button type="submit" className="w-full">Create Event</Button>
      </form>
    </div>
  );
}
