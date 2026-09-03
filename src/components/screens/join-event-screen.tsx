"use client";

import { CheckCircle2, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Brand } from "@/components/ui/brand";
import { Button, Card } from "@/components/ui/primitives";
import type { GroupInvitationPreview } from "@/lib/domain/types";

export function JoinGroupScreen({ token }: { token: string }) {
  const { status } = useSession();
  const { resolveInvitation, requestJoin } = useBillMoshi();
  const [preview, setPreview] = useState<GroupInvitationPreview>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void resolveInvitation(token).then((result) => {
      if (!active) return;
      setPreview(result);
      setInvalid(!result);
      setLoading(false);
    });
    return () => { active = false; };
  }, [resolveInvitation, status, token]);

  async function submit() {
    setSubmitting(true);
    const result = await requestJoin(token);
    const updated = await resolveInvitation(token);
    setPreview(updated);
    setInvalid(result === "invalid" || !updated);
    setSubmitting(false);
  }

  if (status === "loading") return <main className="grid min-h-dvh place-items-center bg-app px-4"><div className="size-12 animate-pulse rounded-2xl bg-brand-soft" /></main>;
  if (status !== "authenticated") return <main className="grid min-h-dvh place-items-center bg-app px-4"><Card className="w-full max-w-md p-8 text-center"><Brand /><span className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand-dark"><ShieldCheck size={27} aria-hidden="true" /></span><h1 className="mt-5 text-2xl font-extrabold tracking-tight">Sign in to request access</h1><p className="mt-2 text-sm leading-6 text-muted">Your Google identity lets the Group owner review and approve the correct person.</p><Link href={`/login?callbackUrl=${encodeURIComponent(`/join/${token}`)}`} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-ink">Sign In with Google</Link></Card></main>;
  if (loading) return <main className="grid min-h-dvh place-items-center bg-app px-4"><div className="size-12 animate-pulse rounded-2xl bg-brand-soft" /></main>;
  if (invalid || !preview) return <main className="grid min-h-dvh place-items-center bg-app px-4"><Card className="w-full max-w-md p-8 text-center"><Brand /><span className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger"><LockKeyhole size={27} aria-hidden="true" /></span><h1 className="mt-5 text-2xl font-extrabold tracking-tight">This invitation isn’t available</h1><p className="mt-2 text-sm leading-6 text-muted">The Group owner may have disabled it, or the link may have expired.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-ink">Open Bill Moshi</Link></Card></main>;

  const approved = preview.requestStatus === "approved";
  const rejected = preview.requestStatus === "rejected";
  const waiting = preview.requestStatus === "pending";

  return <main className="min-h-dvh bg-app px-4 py-8"><div className="mx-auto w-full max-w-md"><Brand /><Card className="mt-8 overflow-hidden"><div className="bg-gradient-to-br from-balance-start to-white p-7 text-center"><span className="text-5xl" aria-hidden="true">{preview.group.emoji}</span><h1 className="mt-4 text-2xl font-extrabold tracking-[-0.04em]">{preview.group.name}</h1><p className="mt-2 text-sm text-muted">Group hosted by {preview.ownerName}</p></div><div className="grid gap-4 p-6"><div className="flex items-center gap-3 text-sm text-muted"><ShieldCheck size={18} className="text-brand-dark" aria-hidden="true" />Owner approval required</div><div className="my-1 border-t border-line" />{approved ? <><div className="rounded-xl bg-success-soft p-4 text-center text-sm font-bold text-success"><CheckCircle2 className="mx-auto mb-2" size={22} aria-hidden="true" />Access approved. The Group will sync after its Drive folder is shared.</div><Link href={`/groups/${preview.group.id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-ink">Open Group</Link></> : waiting ? <div className="rounded-xl bg-warning-soft p-4 text-center text-sm font-bold text-warning"><Clock3 className="mx-auto mb-2" size={22} aria-hidden="true" />Waiting for Group owner approval</div> : rejected ? <div className="rounded-xl bg-danger-soft p-4 text-center text-sm font-bold text-danger">The Group owner declined this request.</div> : <Button type="button" onClick={() => void submit()} disabled={submitting} className="w-full">{submitting ? "Sending Request…" : "Request to Join Group"}</Button>}<p className="text-center text-xs leading-5 text-muted"><LockKeyhole className="mr-1 inline" size={13} aria-hidden="true" /> Events, records, balances, receipts, and financial details remain private until approval.</p></div></Card></div></main>;
}
