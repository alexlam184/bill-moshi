"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudOff,
  Ellipsis,
  FileText,
  Layers3,
  Pencil,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Button, Card } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/calculations";
import type { CurrencyCode, RecordSplit } from "@/lib/domain/types";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export function RecordDetailsScreen({ recordId }: { recordId: string }) {
  const router = useRouter();
  const {
    snapshot,
    hydrated,
    deleteRecord,
    isOnline,
    pendingCount,
    syncing,
    syncMessage,
    syncNow,
  } = useBillMoshi();
  const record = snapshot.records.find((item) => item.id === recordId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteDialogRef = useDialogFocus<HTMLElement>(() => setDeleteOpen(false), deleteOpen);

  if (!record) {
    return hydrated
      ? <div className="p-5 sm:p-8"><Card className="p-8 text-center"><h1 className="font-extrabold">Record not found</h1><Link href="/" className="mt-4 inline-block text-sm font-bold text-brand-dark">Back home</Link></Card></div>
      : <p className="p-5 text-sm text-muted">Loading…</p>;
  }

  const currentRecord = record;
  const event = snapshot.events.find((item) => item.id === record.eventId);
  const group = snapshot.groups.find((item) => item.id === record.groupId);
  const payer = memberForId(record.payerId, snapshot);
  const category = snapshot.categories.find((item) => item.id === record.categoryId);
  const creator = record.createdBy === snapshot.currentUser.id
    ? snapshot.currentUser
    : [...snapshot.members, ...snapshot.groupMembers].find((member) => member.userId === record.createdBy);
  const backHref = event ? `/events/${event.id}` : group ? `/groups/${group.id}` : "/records/mine";
  const converted = record.currencyOriginal !== record.baseCurrency;
  const syncLabel = syncing
    ? "Syncing with Google…"
    : record.syncStatus === "synced"
      ? "Synced with Google Drive"
      : syncMessage || "Saved locally · waiting to sync";
  const recordLabel = record.recordType[0].toUpperCase() + record.recordType.slice(1);
  const primaryLabel = record.recordType === "expense" ? "Paid by" : record.recordType === "income" ? "Received by" : "From";
  const splitLabel = record.recordType === "expense" ? "Split by" : record.recordType === "income" ? "Shared with" : "To";

  function remove() {
    deleteRecord(currentRecord.id);
    setDeleteOpen(false);
    router.push(backHref);
  }

  return (
    <div className="min-h-dvh bg-white">
      <header className="safe-top-header sticky top-0 z-20 grid grid-cols-[48px_1fr_104px] items-center border-b border-line bg-white/95 px-3 backdrop-blur sm:px-5">
        <Link href={backHref} className="grid size-11 place-items-center rounded-full bg-slate-50 text-ink transition hover:bg-slate-100" aria-label="Back to records"><ArrowLeft size={22} /></Link>
        <h1 className="text-center text-lg font-extrabold tracking-tight">Details</h1>
        <div className="flex justify-end gap-2">
          <details className="group relative">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full bg-slate-50 text-ink transition hover:bg-slate-100" aria-label="More record actions"><Ellipsis size={23} /></summary>
            <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-line bg-white p-1.5 shadow-xl">
              <button type="button" onClick={() => setDeleteOpen(true)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-danger hover:bg-danger-soft"><Trash2 size={17} /> Delete Record</button>
            </div>
          </details>
          <Link href={`/records/${record.id}/edit`} className="grid size-11 place-items-center rounded-full bg-brand text-brand-ink shadow-sm transition hover:bg-brand-hover" aria-label={`Edit ${recordLabel.toLowerCase()} record`}><Pencil size={19} /></Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6 sm:px-8 sm:pt-8">
        {record.recurringPaymentId && !record.groupId && <Link href={`/myself/recurring/${record.recurringPaymentId}`} className="mb-5 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 text-sm font-bold text-brand-dark">Recurring payment · View schedule and history <ArrowLeft size={16} className="shrink-0 rotate-180" /></Link>}
        <section aria-label={`${recordLabel} amount`}>
          <div className="mb-4"><span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${record.recordType === "income" ? "bg-success-soft text-success" : record.recordType === "transfer" ? "bg-brand-soft text-brand-dark" : "bg-slate-100 text-muted"}`}>{recordLabel}</span></div>
          <div className="flex items-end justify-between gap-4">
            <p className="text-3xl font-extrabold tracking-[-0.05em]">{record.currencyOriginal}</p>
            <p className={`text-right text-4xl font-extrabold tracking-[-0.055em] ${record.recordType === "income" ? "text-success" : record.recordType === "transfer" ? "text-brand-dark" : ""}`}>{record.recordType === "income" ? "+" : ""}{formatAmountOnly(record.amountOriginal, record.currencyOriginal)}</p>
          </div>
          {converted && <div className="mt-2 text-right"><p className="text-sm font-bold text-muted">{formatMoney(record.amountBase, record.baseCurrency)} in {event ? "Event" : group ? "Group" : "default"} currency</p></div>}
          <div className="mt-6 border-t border-line pt-3 text-right">
            <time dateTime={record.transactionDate} className="text-sm font-bold text-muted">{formatDateTime(record.transactionDate)}</time>
          </div>
          <button type="button" onClick={() => void syncNow()} disabled={syncing} aria-live="polite" className={`ml-auto mt-3 flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-extrabold transition disabled:opacity-60 ${record.syncStatus === "synced" ? "bg-success-soft text-success" : isOnline ? "bg-warning-soft text-warning" : "bg-slate-100 text-muted"}`} aria-label="Sync this record">
            {!isOnline ? <CloudOff size={14} /> : record.syncStatus === "synced" ? <CheckCircle2 size={14} /> : <Cloud size={14} />}
            {syncLabel}{pendingCount > 0 && record.syncStatus !== "synced" ? ` · ${pendingCount} pending` : ""}
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-[1.35rem] border border-line bg-white card-shadow" aria-label="Record information">
          <LedgerRow label="Category">
            <span className="flex min-w-0 items-center gap-2"><span className="text-lg">{category?.emoji ?? "🧾"}</span><span className="truncate">{category?.name ?? "Record"}</span></span>
            {record.receiptFileId ? <a href={`https://drive.google.com/file/d/${encodeURIComponent(record.receiptFileId)}/view`} target="_blank" rel="noopener noreferrer" className="ml-auto grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Open receipt in Google Drive"><FileText size={17} /></a> : record.receiptName && <span className="ml-auto grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark" title={record.receiptName} aria-label={record.receiptName}><FileText size={17} /></span>}
          </LedgerRow>
          <LedgerRow label="Name"><span className="break-words">{record.description}</span></LedgerRow>
          <LedgerRow label="Memo"><span className={record.notes ? "break-words" : "text-muted"}>{record.notes || "N/A"}</span></LedgerRow>
          {converted && <LedgerRow label="Exchange rate"><div className="ml-auto min-w-0 text-right"><p className="font-extrabold text-ink">1 {record.currencyOriginal} → {formatExchangeRate(record.exchangeRate)} {record.baseCurrency}</p><p className="mt-1 text-xs font-semibold text-muted">{event ? "Event" : group ? "Group" : "Default"} currency · {record.exchangeRateSource === "automatic" ? `${record.exchangeRateProvider ?? "Automatic"} rate` : "Manual rate"}{record.exchangeRateDate ? ` · ${formatRateDate(record.exchangeRateDate)}` : ""}</p></div></LedgerRow>}
          <LedgerRow label={group ? "Group" : "Account"} icon={group ? <Layers3 size={16} /> : <UserRound size={16} />}><span>{group ? `${group.emoji} ${group.name}` : "Myself · Personal"}</span></LedgerRow>
          {group && <LedgerRow label="Event"><span>{event ? `${event.emoji} ${event.name}` : "Daily record · No event"}</span></LedgerRow>}

          <div className="h-3 border-y border-line bg-slate-50" />

          <div className="grid grid-cols-[104px_1fr] gap-3 px-4 py-4 sm:grid-cols-[132px_1fr] sm:px-5">
            <p className="pt-2 text-sm font-extrabold">{primaryLabel}</p>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={payer?.name ?? "Unknown"} color={avatarColorFor(payer)} size="sm" />
              <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{payer?.name ?? "Unknown"}</p>
              <p className="shrink-0 text-sm font-extrabold text-muted">{formatMoney(record.amountBase, record.baseCurrency)}</p>
            </div>
          </div>

          {group && <div className="grid grid-cols-[104px_1fr] gap-3 border-t border-line px-4 py-4 sm:grid-cols-[132px_1fr] sm:px-5">
            <p className="pt-2 text-sm font-extrabold">{splitLabel}</p>
            <div className="grid gap-3.5">
              {record.splits.map((split) => {
                const member = memberForId(split.memberId, snapshot);
                return (
                  <div key={split.memberId} className="flex min-w-0 items-center gap-3">
                    <Avatar name={member?.name ?? "Former member"} color={avatarColorFor(member)} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{member?.name ?? "Former member"}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-muted">{record.recordType === "transfer" ? "Transferred" : group ? splitMethodLabel(split) : `Personal ${record.recordType}`}</p>
                      <p className="mt-0.5 text-sm font-extrabold">{formatMoney(split.owedAmount, record.baseCurrency)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}
        </section>

        <footer className="mt-5 border-t border-line pt-4 text-right text-xs leading-5 text-muted">
          <p>Created {formatDateTime(record.createdAt)}</p>
          <p>Created by {creator?.name ?? "Former member"}</p>
          {record.updatedAt !== record.createdAt && <p>Updated {formatDateTime(record.updatedAt)}</p>}
        </footer>
      </div>
      {deleteOpen && <div className="animate-overlay-fade fixed inset-0 z-[80] grid items-end overscroll-contain bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="delete-record-title"><button type="button" className="absolute inset-0" aria-label="Cancel deleting record" onClick={() => setDeleteOpen(false)} /><section ref={deleteDialogRef} className="animate-sheet-in safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-danger">Permanent Action</p><h2 id="delete-record-title" className="mt-1 text-xl font-extrabold tracking-tight">Delete This {recordLabel}?</h2></div><button type="button" onClick={() => setDeleteOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close"><X size={20} /></button></div><p className="mt-5 rounded-xl bg-danger-soft p-4 text-sm leading-6 text-ink">{group ? "This permanently removes the record and changes everyone’s balances." : "This permanently removes the personal record."} This cannot be undone.</p><div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button type="button" variant="danger" onClick={remove}><Trash2 size={16} /> Delete Record</Button></div></section></div>}
    </div>
  );
}

type Snapshot = ReturnType<typeof useBillMoshi>["snapshot"];

function memberForId(memberId: string, snapshot: Snapshot) {
  return snapshot.members.find((member) => member.id === memberId)
    ?? snapshot.groupMembers.find((member) => member.id === memberId)
    ?? (memberId === snapshot.currentUser.id ? snapshot.currentUser : undefined);
}

function avatarColorFor(member: ReturnType<typeof memberForId>) {
  return member && "avatarColor" in member ? member.avatarColor : undefined;
}

function LedgerRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-16 grid-cols-[104px_1fr] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[132px_1fr] sm:px-5">
      <p className="flex items-center gap-2 text-sm font-extrabold">{icon && <span className="text-brand-dark">{icon}</span>}{label}</p>
      <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-muted">{children}</div>
    </div>
  );
}

function splitMethodLabel(split: RecordSplit) {
  if (split.splitMethod === "equal") return "Split equally";
  if (split.splitMethod === "percentage") return `${split.percentage ?? 0}%`;
  if (split.splitMethod === "shares") return `${split.shares ?? 0} shares`;
  return "Exact amount";
}

function formatAmountOnly(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value);
}

function formatExchangeRate(rate: number) {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 8, useGrouping: false }).format(rate);
}

function formatRateDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
