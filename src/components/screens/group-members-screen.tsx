"use client";

import { ArrowLeft, Check, Copy, Link2, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Button, Card, PageTitle } from "@/components/ui/primitives";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export function GroupMembersScreen({ groupId }: { groupId: string }) {
  const { snapshot, hydrated, createInvitation, revokeInvitation, refreshJoinRequests, reviewJoinRequest } = useBillMoshi();
  const group = snapshot.groups.find((item) => item.id === groupId);
  const members = snapshot.groupMembers.filter((member) => member.groupId === groupId && member.status === "active");
  const pending = snapshot.joinRequests.filter((request) => request.groupId === groupId && request.status === "pending");
  const activeInvitation = snapshot.invitations.find((invitation) => invitation.groupId === groupId && invitation.isActive);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"regenerate" | "disable">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!hydrated || !group || group.ownerId !== snapshot.currentUser.id) return;
    void refreshJoinRequests(groupId).catch((refreshError) => setError(refreshError instanceof Error ? refreshError.message : "Could not load requests."));
  }, [group, groupId, hydrated, refreshJoinRequests, snapshot.currentUser.id]);
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

  async function regenerate() {
    if (activeInvitation) await revokeInvitation(activeInvitation.id);
    await createInvitation(groupId, { approvalRequired: true, defaultRole: "member" });
  }

  async function confirmInvitationAction() {
    setBusy(true); setError("");
    try {
      if (confirmAction === "regenerate") await regenerate();
      if (confirmAction === "disable" && activeInvitation) await revokeInvitation(activeInvitation.id);
      setConfirmAction(undefined);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function createLink() {
    setBusy(true); setError("");
    try { await createInvitation(groupId); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not create the invitation."); }
    finally { setBusy(false); }
  }

  async function review(requestId: string, decision: "approved" | "rejected") {
    setBusy(true); setError("");
    try { await reviewJoinRequest(requestId, decision, "member"); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not review this request."); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6">
      <Link href={`/groups/${groupId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {group.name}</Link>
      <PageTitle eyebrow={`${members.length} active`} title="Group members" subtitle="Approved members can participate in this group’s events. Financial details stay private until approval." />
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      {isOwner && <Card className="overflow-hidden"><div className="flex items-center gap-3 border-b border-line p-5"><span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Link2 size={21} /></span><div><h2 className="font-extrabold">Group Invitation Link</h2><p className="mt-0.5 text-xs text-muted">Approval required is on by default.</p></div></div><div className="grid gap-4 p-5">{activeInvitation ? <><div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2 pl-3"><p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">{inviteUrl || "Preparing link…"}</p><Button type="button" onClick={copyLink} className="min-h-11 px-3">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}</Button><span className="sr-only" aria-live="polite">{copied ? "Invitation link copied" : ""}</span></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning"><ShieldCheck className="mr-1 inline" size={14} /> Approval required</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-muted">Default role: {activeInvitation.defaultRole}</span></div><div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmAction("regenerate")}><RefreshCw size={16} /> Regenerate</Button><Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmAction("disable")}>Disable Link</Button></div></> : <Button type="button" disabled={busy} onClick={() => void createLink()}><UserPlus size={17} /> {busy ? "Creating…" : "Create Group Invitation"}</Button>}</div></Card>}

      {isOwner && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">Pending Requests</h2>{pending.length > 0 && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-extrabold text-warning">{pending.length} waiting</span>}</div><Card className="divide-y divide-line overflow-hidden">{pending.length === 0 ? <div className="p-6 text-center text-sm text-muted">No one is waiting for approval.</div> : pending.map((request) => <div key={request.id} className="virtual-list-item p-4"><div className="flex items-center gap-3"><Avatar name={request.requesterName} color="var(--color-avatar-success)" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{request.requesterName}</p><p className="truncate text-xs text-muted">{request.requesterEmail}</p></div><p className="text-[0.68rem] text-muted">{new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(request.requestedAt))}</p></div><div className="mt-3 grid grid-cols-2 gap-2 pl-[3.25rem]"><Button type="button" variant="secondary" disabled={busy} onClick={() => void review(request.id, "rejected")}><X size={16} /> Reject</Button><Button type="button" disabled={busy} onClick={() => void review(request.id, "approved")}><Check size={16} /> Approve</Button></div></div>)}</Card></section>}

      <section><h2 className="mb-3 text-lg font-extrabold">Everyone</h2><Card className="divide-y divide-line overflow-hidden">{members.map((member) => <div key={member.id} className="virtual-list-item flex items-center gap-3 p-4"><Avatar name={member.name} color={member.avatarColor} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.name}{member.userId === snapshot.currentUser.id ? " (you)" : ""}</p><p className="truncate text-xs text-muted">{member.email}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-muted">{member.role}</span></div>)}</Card></section>
      {confirmAction && <InvitationConfirmModal action={confirmAction} onClose={() => setConfirmAction(undefined)} onConfirm={() => void confirmInvitationAction()} />}
    </div>
  );
}

function InvitationConfirmModal({ action, onClose, onConfirm }: { action: "regenerate" | "disable"; onClose(): void; onConfirm(): void }) {
  const regenerate = action === "regenerate";
  const dialogRef = useDialogFocus<HTMLElement>(onClose);
  return <div className="animate-overlay-fade fixed inset-0 z-[80] grid items-end overscroll-contain bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="invitation-confirm-title"><button type="button" className="absolute inset-0" aria-label="Cancel invitation change" onClick={onClose} /><section ref={dialogRef} className="animate-sheet-in safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-danger">Existing Link Stops Working</p><h2 id="invitation-confirm-title" className="mt-1 text-xl font-extrabold tracking-tight">{regenerate ? "Regenerate Invitation Link?" : "Disable Invitation Link?"}</h2></div><button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close"><X size={20} /></button></div><p className="mt-5 text-sm leading-6 text-muted">{regenerate ? "The current link will be revoked and replaced with a new approval-required link." : "No one can use the current link after it is disabled."}</p><div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" variant="danger" onClick={onConfirm}>{regenerate ? "Regenerate" : "Disable Link"}</Button></div></section></div>;
}
