"use client";

import { CalendarDays, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Brand } from "@/components/ui/brand";
import { Button, Card } from "@/components/ui/primitives";

export function JoinGroupScreen({ token }: { token: string }) {
  const { snapshot, hydrated, requestJoin } = useBillMoshi();
  const invitation = snapshot.invitations.find((item) => item.token === token);
  const group = invitation ? snapshot.groups.find((item) => item.id === invitation.groupId) : undefined;
  const [result, setResult] = useState<"idle" | "created" | "duplicate" | "invalid">("idle");
  const members = group ? snapshot.groupMembers.filter((member) => member.groupId === group.id && member.status === "active") : [];
  const events = group ? snapshot.events.filter((event) => event.groupId === group.id) : [];
  const owner = members.find((member) => member.role === "owner");
  const expired = invitation?.expiresAt ? new Date(invitation.expiresAt) < new Date() : false;
  const valid = Boolean(invitation?.isActive && group && !expired && (!invitation.maxUses || invitation.useCount < invitation.maxUses));
  function submit() { setResult(requestJoin(token)); }

  if (!hydrated && !valid) return <main className="grid min-h-dvh place-items-center bg-[#f4f8fb] px-4"><div className="size-12 animate-pulse rounded-2xl bg-brand-soft" /></main>;
  if (!valid) return <main className="grid min-h-dvh place-items-center bg-[#f4f8fb] px-4"><Card className="w-full max-w-md p-8 text-center"><Brand /><span className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger"><LockKeyhole size={27} /></span><h1 className="mt-5 text-2xl font-extrabold tracking-tight">This invitation isn’t available</h1><p className="mt-2 text-sm leading-6 text-muted">The group owner may have disabled it, or the link may have expired.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-[#103a55]">Open Bill Moshi</Link></Card></main>;

  const existingRequest = snapshot.joinRequests.find((request) => request.groupId === group!.id && request.requesterUserId === snapshot.currentUser.id && request.status === "pending");
  const existingMember = members.some((member) => member.userId === snapshot.currentUser.id);
  const waiting = result === "created" || result === "duplicate" || Boolean(existingRequest);

  return <main className="min-h-dvh bg-[#f4f8fb] px-4 py-8"><div className="mx-auto w-full max-w-md"><Brand /><Card className="mt-8 overflow-hidden"><div className="bg-gradient-to-br from-[#dff2ff] to-white p-7 text-center"><span className="text-5xl">{group!.emoji}</span><h1 className="mt-4 text-2xl font-extrabold tracking-[-0.04em]">{group!.name}</h1><p className="mt-2 text-sm text-muted">Group hosted by {owner?.name ?? "the owner"}</p></div><div className="grid gap-4 p-6"><div className="flex items-center gap-3 text-sm text-muted"><UsersRound size={18} className="text-brand-dark" />{members.length} group members</div><div className="flex items-center gap-3 text-sm text-muted"><CalendarDays size={18} className="text-brand-dark" />{events.length} {events.length === 1 ? "event" : "events"}</div><div className="flex items-center gap-3 text-sm text-muted"><ShieldCheck size={18} className="text-brand-dark" />Owner approval required</div><div className="my-1 border-t border-line" />{existingMember ? <div className="rounded-xl bg-success-soft p-4 text-center text-sm font-bold text-success"><CheckCircle2 className="mx-auto mb-2" size={22} />You’re already a member of this group.</div> : waiting ? <div className="rounded-xl bg-warning-soft p-4 text-center text-sm font-bold text-warning"><Clock3 className="mx-auto mb-2" size={22} />Waiting for group owner approval</div> : <Button type="button" onClick={submit} className="w-full">Request to join group</Button>}<p className="text-center text-xs leading-5 text-muted"><LockKeyhole className="mr-1 inline" size={13} /> Events, expenses, balances, receipts, and financial details remain private until approval.</p></div></Card></div></main>;
}
