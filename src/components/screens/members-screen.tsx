"use client";

import { ArrowLeft, UsersRound } from "lucide-react";
import Link from "next/link";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Card, PageTitle } from "@/components/ui/primitives";

export function MembersScreen({ eventId }: { eventId: string }) {
  const { snapshot } = useBillMoshi();
  const event = snapshot.events.find((item) => item.id === eventId);
  if (!event) return <p>Event not found.</p>;
  const group = snapshot.groups.find((item) => item.id === event.groupId);
  const members = snapshot.members.filter((member) => member.eventId === eventId && member.status === "active");

  return (
    <div className="grid gap-6 animate-rise">
      <Link href={`/events/${eventId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {event.name}</Link>
      <PageTitle eyebrow={`${members.length} participants`} title="Event members" subtitle={`Members are inherited from ${group?.name ?? "the parent group"}.`} action={group && <Link href={`/groups/${group.id}/members`} className="grid size-11 place-items-center rounded-xl bg-brand text-[#103a55]" aria-label="Manage group members"><UsersRound size={20} /></Link>} />
      <Card className="bg-brand-soft/40 p-4 text-sm leading-6 text-muted">Invite and approve people at the group level. Approved group members can participate in this group’s events.</Card>
      <Card className="divide-y divide-line overflow-hidden">
        {members.map((member) => <div key={member.id} className="flex items-center gap-3 p-4"><Avatar name={member.name} color={member.avatarColor} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.name}{member.userId === snapshot.currentUser.id ? " (you)" : ""}</p><p className="truncate text-xs text-muted">{member.email}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-muted">{member.role}</span></div>)}
      </Card>
    </div>
  );
}
