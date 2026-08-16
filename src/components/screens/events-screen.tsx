"use client";

import { CalendarPlus, ChevronRight, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { eventNetBalances, formatMoney, totalEventSpending } from "@/lib/domain/calculations";
import { PageTitle, fieldClass } from "@/components/ui/primitives";

export function EventsScreen() {
  const { snapshot } = useBillMoshi();
  const [query, setQuery] = useState("");
  const events = snapshot.events.filter((event) => {
    const group = snapshot.groups.find((item) => item.id === event.groupId);
    return `${event.name} ${group?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="grid gap-6 animate-rise">
      <PageTitle eyebrow="All groups" title="Events" subtitle="Specific trips, dinners, and activities, organized by group." action={<Link href="/events/new" className="grid size-11 place-items-center rounded-xl bg-brand text-[#103a55]" aria-label="Create event"><CalendarPlus size={20} /></Link>} />
      <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldClass} pl-11`} placeholder="Search events or groups" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((event) => {
          const group = snapshot.groups.find((item) => item.id === event.groupId);
          const members = snapshot.members.filter((member) => member.eventId === event.id && member.status === "active");
          const me = members.find((member) => member.userId === snapshot.currentUser.id);
          const balance = me ? eventNetBalances(event.id, snapshot.members, snapshot.expenses, snapshot.settlements).get(me.id) ?? 0 : 0;
          return (
            <Link key={event.id} href={`/events/${event.id}`} className="group rounded-[1.3rem] border border-line bg-white p-5 card-shadow transition hover:-translate-y-0.5 hover:border-brand">
              <div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-2xl">{event.emoji}</span><ChevronRight className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-dark" size={19} /></div>
              <p className="mt-4 text-xs font-extrabold text-brand-dark">{group?.emoji} {group?.name ?? "Group"}</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight">{event.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><UsersRound size={13} /> {members.length} members · {event.baseCurrency}</p>
              <div className="mt-5 flex items-end justify-between border-t border-line pt-4"><div><p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Total spent</p><p className="mt-1 text-sm font-extrabold">{formatMoney(totalEventSpending(event.id, snapshot.expenses), event.baseCurrency)}</p></div><p className={`text-sm font-extrabold ${balance >= 0 ? "text-success" : "text-danger"}`}>{balance > 0 ? `+${formatMoney(balance, event.baseCurrency)}` : balance < 0 ? `−${formatMoney(Math.abs(balance), event.baseCurrency)}` : "Settled"}</p></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
