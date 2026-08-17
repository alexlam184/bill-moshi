"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, CircleDollarSign } from "lucide-react";
import Link from "next/link";
import { useBillMoshi } from "@/components/providers/app-provider";
import { eventNetBalances, formatMoney, simplifyBalances } from "@/lib/domain/calculations";
import { Avatar, Card, EmptyState, PageTitle } from "@/components/ui/primitives";

export function BalancesScreen({ eventId }: { eventId: string }) {
  const { snapshot } = useBillMoshi();
  const event = snapshot.events.find((item) => item.id === eventId);
  if (!event) return <p>Event not found.</p>;
  const members = snapshot.members.filter((member) => member.eventId === eventId && member.status === "active");
  const balances = eventNetBalances(eventId, snapshot.members, snapshot.expenses, snapshot.settlements);
  const debts = simplifyBalances(balances, event.baseCurrency);
  return <div className="grid gap-6"><Link href={`/events/${eventId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {event.name}</Link><PageTitle eyebrow="Current event" title="Balances" subtitle="Positive means the group owes that person; negative means they owe the group." /><div className="grid gap-3 sm:grid-cols-2">{members.map((member) => { const balance = balances.get(member.id) ?? 0; return <Card key={member.id} className="flex items-center gap-3 p-4"><Avatar name={member.name} color={member.avatarColor} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.name}{member.userId === snapshot.currentUser.id ? " (you)" : ""}</p><p className="mt-0.5 text-xs text-muted">{Math.abs(balance) < 0.005 ? "Settled up" : balance > 0 ? "is owed" : "owes"}</p></div><p className={`text-sm font-extrabold ${balance > 0 ? "text-success" : balance < 0 ? "text-danger" : "text-muted"}`}>{balance > 0 ? "+" : balance < 0 ? "−" : ""}{formatMoney(Math.abs(balance), event.baseCurrency)}</p></Card>; })}</div><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">Suggested payments</h2><span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">Simplified</span></div><Card className="divide-y divide-line overflow-hidden">{debts.length === 0 ? <EmptyState icon={<CheckCircle2 size={24} />} title="All settled up" body="There are no outstanding balances in this event." /> : debts.map((debt, index) => { const from = members.find((member) => member.id === debt.fromMemberId); const to = members.find((member) => member.id === debt.toMemberId); return <div key={`${debt.fromMemberId}-${debt.toMemberId}-${index}`} className="flex items-center gap-3 p-4"><Avatar name={from?.name ?? "?"} color={from?.avatarColor} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">{from?.name} <ArrowRight className="mx-1 inline text-muted" size={14} /> {to?.name}</p><p className="mt-0.5 text-xs text-muted">should pay</p></div><p className="text-sm font-extrabold">{formatMoney(debt.amount, event.baseCurrency)}</p></div>; })}</Card></section><Link href={`/settle?eventId=${eventId}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-extrabold text-brand-ink"><CircleDollarSign size={18} /> Settle up</Link></div>;
}
