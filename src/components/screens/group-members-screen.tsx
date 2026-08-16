"use client";

import { ArrowLeft, Check, Copy, Link2, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Button, Card, PageTitle } from "@/components/ui/primitives";

export function GroupMembersScreen({ groupId }: { groupId: string }) {
  const { snapshot, hydrated, createInvitation, revokeInvitation, reviewJoinRequest } = useBillMoshi();
  const group = snapshot.groups.find((item) => item.id === groupId);
  const members = snapshot.groupMembers.filter((member) => member.groupId === groupId && member.status === "active");
  const pending = snapshot.joinRequests.filter((request) => request.groupId === groupId && request.status === "pending");
  const activeInvitation = snapshot.invitations.find((invitation) => invitation.groupId === groupId && invitation.isActive);
  const [copied, setCopied] = useState(false);
  if (!group && !hydrated) return <div className="min-h-48 animate-pulse rounded-[1.35rem] bg-slate-50" />;
  if (!group) return <p>Group not found.</p>;
  const isOwner = group.ownerId === snapshot.currentUser.id;
  const inviteUrl = activeInvitation ? `/join/${activeInvitation.token}` : "";

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(new URL(inviteUrl, window.location.origin).toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function regenerate() {
    if (activeInvitation) revokeInvitation(activeInvitation.id);
    createInvitation(groupId, { approvalRequired: true, defaultRole: "member" });
  }

  return (
    <div className="grid gap-6 animate-rise">
      <Link href={`/groups/${groupId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {group.name}</Link>
      <PageTitle eyebrow={`${members.length} active`} title="Group members" subtitle="Approved members can participate in this group’s events. Financial details stay private until approval." />

      {isOwner && <Card className="overflow-hidden"><div className="flex items-center gap-3 border-b border-line p-5"><span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Link2 size={21} /></span><div><h2 className="font-extrabold">Group invitation link</h2><p className="mt-0.5 text-xs text-muted">Approval required is on by default.</p></div></div><div className="grid gap-4 p-5">{activeInvitation ? <><div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2 pl-3"><p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">{inviteUrl || "Preparing link…"}</p><Button type="button" onClick={copyLink} className="min-h-9 px-3">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}</Button></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning"><ShieldCheck className="mr-1 inline" size={14} /> Approval required</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-muted">Default role: {activeInvitation.defaultRole}</span></div><div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={regenerate}><RefreshCw size={16} /> Regenerate</Button><Button type="button" variant="danger" onClick={() => revokeInvitation(activeInvitation.id)}>Disable link</Button></div></> : <Button type="button" onClick={() => createInvitation(groupId)}><UserPlus size={17} /> Create group invitation</Button>}</div></Card>}

      {isOwner && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">Pending requests</h2>{pending.length > 0 && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-extrabold text-warning">{pending.length} waiting</span>}</div><Card className="divide-y divide-line overflow-hidden">{pending.length === 0 ? <div className="p-6 text-center text-sm text-muted">No one is waiting for approval.</div> : pending.map((request) => <div key={request.id} className="p-4"><div className="flex items-center gap-3"><Avatar name={request.requesterName} color="#27AE60" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{request.requesterName}</p><p className="truncate text-xs text-muted">{request.requesterEmail}</p></div><p className="text-[0.68rem] text-muted">{new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(request.requestedAt))}</p></div><div className="mt-3 grid grid-cols-2 gap-2 pl-[3.25rem]"><Button type="button" variant="secondary" onClick={() => reviewJoinRequest(request.id, "rejected")}><X size={16} /> Reject</Button><Button type="button" onClick={() => reviewJoinRequest(request.id, "approved", "member")}><Check size={16} /> Approve</Button></div></div>)}</Card></section>}

      <section><h2 className="mb-3 text-lg font-extrabold">Everyone</h2><Card className="divide-y divide-line overflow-hidden">{members.map((member) => <div key={member.id} className="flex items-center gap-3 p-4"><Avatar name={member.name} color={member.avatarColor} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.name}{member.userId === snapshot.currentUser.id ? " (you)" : ""}</p><p className="truncate text-xs text-muted">{member.email}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-muted">{member.role}</span></div>)}</Card></section>
    </div>
  );
}
