"use client";

import { ArrowLeft, Coins, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";

const emojiOptions = ["👨‍👩‍👧‍👦", "🏠", "🤝", "👥", "🎓", "💼", "⚽", "🎭"];

export function CreateGroupScreen() {
  const router = useRouter();
  const { snapshot, createGroup } = useBillMoshi();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👨‍👩‍👧‍👦");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(snapshot.currentUser.defaultCurrency);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give your group a name.");
    const groupId = createGroup({ name, emoji, description, currency });
    router.push(`/groups/${groupId}`);
  }

  return (
    <div className="grid gap-6 animate-rise">
      <Link href="/" className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> Groups</Link>
      <PageTitle eyebrow="New group" title="Create a group" subtitle="A long-term space for family, roommates, friends, or a team." />
      <form onSubmit={submit} className="grid gap-5">
        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><UsersRound size={19} /></span>
            <div><h2 className="font-extrabold">Group details</h2><p className="text-xs text-muted">You can add specific events inside it next.</p></div>
          </div>
          <Field label="Group name" error={error}>
            <input autoFocus className={fieldClass} placeholder="e.g. Moshi Family" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} />
          </Field>
          <Field label="Choose an icon">
            <div className="grid grid-cols-8 gap-2">
              {emojiOptions.map((option) => <button key={option} type="button" onClick={() => setEmoji(option)} className={`grid aspect-square place-items-center rounded-xl text-xl transition ${emoji === option ? "bg-brand ring-2 ring-brand-dark/20" : "bg-slate-50 hover:bg-brand-soft"}`} aria-label={`Use ${option}`}>{option}</button>)}
            </div>
          </Field>
          <Field label="Description" hint="Optional — a short reminder of who this group is for.">
            <textarea className={`${fieldClass} min-h-24 py-3`} placeholder="Family trips and shared activities" value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </Card>
        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Coins size={19} /></span><div><h2 className="font-extrabold">Group currency</h2><p className="text-xs text-muted">Daily Group records convert to this currency.</p></div></div>
          <Field label="Default Group currency"><select className={fieldClass} value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></Field>
        </Card>
        <Button type="submit" className="w-full">Create group</Button>
      </form>
    </div>
  );
}
