"use client";

import { ArrowLeft, CalendarDays, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";

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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!groupId) return setError("Choose a group for this event.");
    if (!name.trim()) return setError("Give your event a name.");
    if (startDate && endDate && endDate < startDate) return setError("End date must be after the start date.");
    const eventId = createEvent({ groupId, name, emoji, baseCurrency: currency, startDate: startDate || undefined, endDate: endDate || undefined });
    router.push(`/events/${eventId}`);
  }

  if (snapshot.groups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-extrabold">Create a group first</h1>
        <p className="mt-2 text-sm text-muted">Every event belongs to a family, roommate, friend, or team group.</p>
        <Link href="/groups/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-[#103a55]">Create group</Link>
      </Card>
    );
  }

  const backHref = groupId ? `/groups/${groupId}` : "/";

  return (
    <div className="grid gap-6 animate-rise">
      <Link href={backHref} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> Group</Link>
      <PageTitle eyebrow="New event" title="Create an event" subtitle="A specific trip, dinner, or activity inside one of your groups." />
      <form onSubmit={submit} className="grid gap-5">
        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><UsersRound size={19} /></span>
            <div><h2 className="font-extrabold">Parent group</h2><p className="text-xs text-muted">The hamburger menu switches between these groups.</p></div>
          </div>
          <Field label="Group">
            <select className={fieldClass} value={groupId} onChange={(event) => { const nextGroupId = event.target.value; setGroupId(nextGroupId); setCurrency(snapshot.groups.find((group) => group.id === nextGroupId)?.currency ?? snapshot.currentUser.defaultCurrency); setError(""); }}>
              {snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>)}
            </select>
          </Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <Field label="Event name" error={error}>
            <input autoFocus className={fieldClass} placeholder="e.g. 2026 Toronto Trip" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} />
          </Field>
          <Field label="Choose an icon">
            <div className="grid grid-cols-8 gap-2">
              {emojiOptions.map((option) => <button key={option} type="button" onClick={() => setEmoji(option)} className={`grid aspect-square place-items-center rounded-xl text-xl transition ${emoji === option ? "bg-brand ring-2 ring-brand-dark/20" : "bg-slate-50 hover:bg-brand-soft"}`} aria-label={`Use ${option}`}>{option}</button>)}
            </div>
          </Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><WalletCards size={19} /></span><div><h2 className="font-extrabold">Money</h2><p className="text-xs text-muted">Balances are calculated in this currency.</p></div></div>
          <Field label="Base currency"><select className={fieldClass} value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code} — {code === "CAD" ? "Canadian Dollar" : code === "HKD" ? "Hong Kong Dollar" : "Japanese Yen"}</option>)}</select></Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><CalendarDays size={19} /></span><div><h2 className="font-extrabold">Dates</h2><p className="text-xs text-muted">Optional — useful for trips and activities.</p></div></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Starts"><input type="date" className={fieldClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field><Field label="Ends"><input type="date" className={fieldClass} value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></Field></div>
        </Card>
        <Button type="submit" className="w-full">Create event</Button>
      </form>
    </div>
  );
}
