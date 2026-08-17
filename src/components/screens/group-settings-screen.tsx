"use client";

import { ArrowLeft, Coins } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";

export function GroupSettingsScreen({ groupId }: { groupId: string }) {
  const { snapshot, hydrated } = useBillMoshi();
  const group = snapshot.groups.find((item) => item.id === groupId);

  if (!hydrated) return <div className="min-h-48 animate-pulse rounded-[1.35rem] bg-slate-50" />;
  if (!group) return <Card className="p-8 text-center"><h1 className="font-extrabold">Group not found</h1><Link href="/" className="mt-4 inline-block text-sm font-bold text-brand-dark">Back to groups</Link></Card>;

  const isOwner = group.ownerId === snapshot.currentUser.id;

  return <div className="grid gap-6">
    <Link href={`/groups/${groupId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {group.name}</Link>
    <PageTitle eyebrow="Group settings" title="Group currency" subtitle="Daily Group records use this currency for balances and exchange-rate comparisons." />
    {!isOwner ? <Card className="p-6 text-sm leading-6 text-muted">Only the Group owner can change this setting.</Card> : <GroupCurrencyForm key={`${group.id}:${group.currency}`} groupId={group.id} initialCurrency={group.currency} />}
  </div>;
}

function GroupCurrencyForm({ groupId, initialCurrency }: { groupId: string; initialCurrency: CurrencyCode }) {
  const router = useRouter();
  const { updateGroupCurrency } = useBillMoshi();
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  useUnsavedChanges(currency !== initialCurrency);

  function save(event: FormEvent) {
    event.preventDefault();
    updateGroupCurrency(groupId, currency);
    router.push(`/groups/${groupId}`);
  }

  return <form onSubmit={save} className="grid gap-5">
    <Card className="grid gap-5 p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Coins size={20} /></span><div><h2 className="font-extrabold">Default Group currency</h2><p className="mt-1 text-xs leading-5 text-muted">New daily records convert to this currency. Events keep their own Event currency.</p></div></div>
      <Field label="Currency" hint="Existing records keep their saved currency, amount, and exchange rate."><select aria-label="Group currency" className={fieldClass} value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></Field>
    </Card>
    <Button type="submit">Save Group currency</Button>
  </form>;
}
