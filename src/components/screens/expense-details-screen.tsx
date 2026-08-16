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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Card } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/calculations";
import type { CurrencyCode, ExpenseSplit } from "@/lib/domain/types";

export function ExpenseDetailsScreen({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const {
    snapshot,
    hydrated,
    deleteExpense,
    isOnline,
    pendingCount,
    syncing,
    syncMessage,
    syncNow,
  } = useBillMoshi();
  const expense = snapshot.expenses.find((item) => item.id === expenseId);

  if (!expense) {
    return hydrated
      ? <div className="p-5 sm:p-8"><Card className="p-8 text-center"><h1 className="font-extrabold">Expense not found</h1><Link href="/" className="mt-4 inline-block text-sm font-bold text-brand-dark">Back home</Link></Card></div>
      : <p className="p-5 text-sm text-muted">Loading…</p>;
  }

  const currentExpense = expense;
  const event = snapshot.events.find((item) => item.id === expense.eventId);
  const group = snapshot.groups.find((item) => item.id === expense.groupId);
  const payer = memberForId(expense.payerId, snapshot);
  const category = snapshot.categories.find((item) => item.id === expense.categoryId);
  const creator = expense.createdBy === snapshot.currentUser.id
    ? snapshot.currentUser
    : [...snapshot.members, ...snapshot.groupMembers].find((member) => member.userId === expense.createdBy);
  const backHref = event ? `/events/${event.id}` : group ? `/groups/${group.id}` : "/records/mine";
  const converted = expense.currencyOriginal !== expense.baseCurrency;
  const syncLabel = syncing
    ? "Syncing with Google…"
    : expense.syncStatus === "synced"
      ? "Synced with Google Drive"
      : syncMessage || "Saved locally · waiting to sync";
  const recordLabel = expense.recordType[0].toUpperCase() + expense.recordType.slice(1);
  const primaryLabel = expense.recordType === "expense" ? "Paid by" : expense.recordType === "income" ? "Received by" : "From";
  const splitLabel = expense.recordType === "expense" ? "Split by" : expense.recordType === "income" ? "Shared with" : "To";

  function remove() {
    if (!window.confirm(group ? `Delete this ${recordLabel.toLowerCase()} record? This will change everyone’s balances.` : `Delete this personal ${recordLabel.toLowerCase()} record?`)) return;
    deleteExpense(currentExpense.id);
    router.push(backHref);
  }

  return (
    <div className="min-h-dvh bg-white animate-rise">
      <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[48px_1fr_104px] items-center border-b border-line bg-white/95 px-3 backdrop-blur sm:px-5">
        <Link href={backHref} className="grid size-11 place-items-center rounded-full bg-slate-50 text-ink transition hover:bg-slate-100" aria-label="Back to records"><ArrowLeft size={22} /></Link>
        <h1 className="text-center text-lg font-extrabold tracking-tight">Details</h1>
        <div className="flex justify-end gap-2">
          <details className="group relative">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full bg-slate-50 text-ink transition hover:bg-slate-100" aria-label="More record actions"><Ellipsis size={23} /></summary>
            <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-line bg-white p-1.5 shadow-xl">
              <button type="button" onClick={remove} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-danger hover:bg-danger-soft"><Trash2 size={17} /> Delete record</button>
            </div>
          </details>
          <Link href={`/expenses/${expense.id}/edit`} className="grid size-11 place-items-center rounded-full bg-brand text-[#103a55] shadow-sm transition hover:bg-[#62afe5]" aria-label="Edit expense"><Pencil size={19} /></Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6 sm:px-8 sm:pt-8">
        <section aria-label="Expense amount">
          <div className="mb-4"><span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${expense.recordType === "income" ? "bg-success-soft text-success" : expense.recordType === "transfer" ? "bg-brand-soft text-brand-dark" : "bg-slate-100 text-muted"}`}>{recordLabel}</span></div>
          <div className="flex items-end justify-between gap-4">
            <p className="text-3xl font-extrabold tracking-[-0.05em]">{expense.currencyOriginal}</p>
            <p className={`text-right text-4xl font-extrabold tracking-[-0.055em] ${expense.recordType === "income" ? "text-success" : expense.recordType === "transfer" ? "text-brand-dark" : ""}`}>{expense.recordType === "income" ? "+" : ""}{formatAmountOnly(expense.amountOriginal, expense.currencyOriginal)}</p>
          </div>
          {converted && <div className="mt-2 text-right"><p className="text-sm font-bold text-muted">{formatMoney(expense.amountBase, expense.baseCurrency)} in {event ? "Event" : group ? "Group" : "default"} currency</p></div>}
          <div className="mt-6 border-t border-line pt-3 text-right">
            <time dateTime={expense.transactionDate} className="text-sm font-bold text-muted">{formatDateTime(expense.transactionDate)}</time>
          </div>
          <button type="button" onClick={() => void syncNow()} disabled={syncing} className={`ml-auto mt-3 flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-extrabold transition disabled:opacity-60 ${expense.syncStatus === "synced" ? "bg-success-soft text-success" : isOnline ? "bg-warning-soft text-warning" : "bg-slate-100 text-muted"}`} aria-label="Sync this record">
            {!isOnline ? <CloudOff size={14} /> : expense.syncStatus === "synced" ? <CheckCircle2 size={14} /> : <Cloud size={14} />}
            {syncLabel}{pendingCount > 0 && expense.syncStatus !== "synced" ? ` · ${pendingCount} pending` : ""}
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-[1.35rem] border border-line bg-white card-shadow" aria-label="Record information">
          <LedgerRow label="Category">
            <span className="flex min-w-0 items-center gap-2"><span className="text-lg">{category?.emoji ?? "🧾"}</span><span className="truncate">{category?.name ?? "Expense"}</span></span>
            {(expense.receiptName || expense.receiptFileId) && <span className="ml-auto grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark" title={expense.receiptName ?? "Receipt stored in Google Drive"} aria-label={expense.receiptName ?? "Receipt stored in Google Drive"}><FileText size={17} /></span>}
          </LedgerRow>
          <LedgerRow label="Name"><span className="break-words">{expense.description}</span></LedgerRow>
          <LedgerRow label="Memo"><span className={expense.notes ? "break-words" : "text-slate-400"}>{expense.notes || "N/A"}</span></LedgerRow>
          {converted && <LedgerRow label="Exchange rate"><div className="ml-auto min-w-0 text-right"><p className="font-extrabold text-ink">1 {expense.currencyOriginal} → {formatExchangeRate(expense.exchangeRate)} {expense.baseCurrency}</p><p className="mt-1 text-xs font-semibold text-muted">{event ? "Event" : group ? "Group" : "Default"} currency · {expense.exchangeRateSource === "automatic" ? `${expense.exchangeRateProvider ?? "Automatic"} rate` : "Manual rate"}{expense.exchangeRateDate ? ` · ${formatRateDate(expense.exchangeRateDate)}` : ""}</p></div></LedgerRow>}
          <LedgerRow label={group ? "Group" : "Account"} icon={group ? <Layers3 size={16} /> : <UserRound size={16} />}><span>{group ? `${group.emoji} ${group.name}` : "Myself · Personal"}</span></LedgerRow>
          {group && <LedgerRow label="Event"><span>{event ? `${event.emoji} ${event.name}` : "Daily record · No event"}</span></LedgerRow>}

          <div className="h-3 border-y border-line bg-slate-50" />

          <div className="grid grid-cols-[104px_1fr] gap-3 px-4 py-4 sm:grid-cols-[132px_1fr] sm:px-5">
            <p className="pt-2 text-sm font-extrabold">{primaryLabel}</p>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={payer?.name ?? "Unknown"} color={avatarColorFor(payer)} size="sm" />
              <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{payer?.name ?? "Unknown"}</p>
              <p className="shrink-0 text-sm font-extrabold text-muted">{formatMoney(expense.amountBase, expense.baseCurrency)}</p>
            </div>
          </div>

          <div className="grid grid-cols-[104px_1fr] gap-3 border-t border-line px-4 py-4 sm:grid-cols-[132px_1fr] sm:px-5">
            <p className="pt-2 text-sm font-extrabold">{splitLabel}</p>
            <div className="grid gap-3.5">
              {expense.splits.map((split) => {
                const member = memberForId(split.memberId, snapshot);
                return (
                  <div key={split.memberId} className="flex min-w-0 items-center gap-3">
                    <Avatar name={member?.name ?? "Former member"} color={avatarColorFor(member)} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{member?.name ?? "Former member"}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-muted">{expense.recordType === "transfer" ? "Transferred" : group ? splitMethodLabel(split) : `Personal ${expense.recordType}`}</p>
                      <p className="mt-0.5 text-sm font-extrabold">{formatMoney(split.owedAmount, expense.baseCurrency)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="mt-5 border-t border-line pt-4 text-right text-xs leading-5 text-muted">
          <p>Created {formatDateTime(expense.createdAt)}</p>
          <p>Created by {creator?.name ?? "Former member"}</p>
          {expense.updatedAt !== expense.createdAt && <p>Updated {formatDateTime(expense.updatedAt)}</p>}
        </footer>
      </div>
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

function splitMethodLabel(split: ExpenseSplit) {
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
  return rate.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function formatRateDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
