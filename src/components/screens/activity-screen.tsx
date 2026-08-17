"use client";

import { CheckCircle2, Clock3, Link2, ReceiptText, Search, UsersRound, WalletCards } from "lucide-react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Card, EmptyState, PageTitle, fieldClass } from "@/components/ui/primitives";
import { useQueryState } from "@/lib/hooks/use-query-state";

export function ActivityScreen() {
  const { snapshot } = useBillMoshi();
  const [query, setQuery] = useQueryState<string>("query", "");
  const activity = [...snapshot.activity].filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="grid gap-6"><PageTitle eyebrow="Audit Trail" title="Activity" subtitle="A clear record of changes across your Groups and Events." /><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" size={18} /><input aria-label="Search activity" name="activity-search" autoComplete="off" className={`${fieldClass} pl-11`} placeholder="Search Activity…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Card className="divide-y divide-line overflow-hidden">{activity.length === 0 ? <EmptyState icon={<Clock3 size={24} />} title="No Activity Found" body="Try a different search." /> : activity.map((entry) => { const event = snapshot.events.find((item) => item.id === entry.eventId); const group = snapshot.groups.find((item) => item.id === (entry.groupId ?? event?.groupId)); const actor = snapshot.groupMembers.find((member) => member.userId === entry.actorId) ?? snapshot.members.find((member) => member.userId === entry.actorId); return <div key={entry.id} className="virtual-list-item flex gap-3 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark"><ActivityIcon type={entry.type} /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{entry.title}</p><p className="mt-0.5 break-words text-xs leading-5 text-muted">{entry.detail}{event ? ` · ${event.name}` : group ? ` · ${group.name}` : ""}</p><p className="mt-1 text-[0.68rem] text-slate-400">{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</p></div>{actor && <Avatar name={actor.name} color={actor.avatarColor} size="sm" />}</div>; })}</Card></div>;
}

function ActivityIcon({ type }: { type: string }) {
  if (type.includes("expense")) return <ReceiptText size={18} />;
  if (type.includes("join")) return <UsersRound size={18} />;
  if (type.includes("invitation")) return <Link2 size={18} />;
  if (type.includes("settlement")) return <WalletCards size={18} />;
  return <CheckCircle2 size={18} />;
}
