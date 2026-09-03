"use client";

import { ArrowLeft, ChevronRight, Pause, Pencil, Play, Plus, Repeat2, SkipForward, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/calculations";
import { nextPaymentDate, recurringLabel } from "@/lib/domain/recurring-payments";
import type { RecurringPayment } from "@/lib/domain/types";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export const recurringRoot = "/myself/recurring";

export function paymentDateLabel(date?: string) {
  return date ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`)) : "None scheduled";
}

export function paymentStatus(payment: RecurringPayment) {
  if (payment.status === "deleted") return "Deleted";
  if (payment.status === "paused") return "Paused";
  return nextPaymentDate(payment) ? "Active" : "Completed";
}

export function RecurringBack({ href = "/myself", children = "Myself overview" }: { href?: string; children?: ReactNode }) {
  return <Link href={href} className="flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-brand-dark"><ArrowLeft size={18} />{children}</Link>;
}

export function RecurringPaymentsScreen() {
  const { snapshot, hydrated, recurringError } = useBillMoshi();
  const payments = snapshot.recurringPayments.filter((payment) => payment.status !== "deleted")
    .toSorted((a, b) => (nextPaymentDate(a) ?? "9999").localeCompare(nextPaymentDate(b) ?? "9999") || a.name.localeCompare(b.name));
  return <div className="grid gap-5">
    <RecurringBack />
    <PageTitle title="Recurring payments" subtitle="Your personal bills, on repeat." action={<Link href={`${recurringRoot}/new`} aria-label="Add recurring payment" className="grid size-11 place-items-center rounded-xl bg-brand text-brand-ink"><Plus size={21} /></Link>} />
    <p className="rounded-xl bg-brand-soft p-4 text-sm leading-6 text-brand-dark">Due payments become personal records when you open the app. This does not send money or charge your bank account.</p>
    {recurringError && <p role="alert" className="break-words rounded-xl bg-danger-soft p-4 text-sm text-danger">{recurringError}</p>}
    {!hydrated ? <p role="status" className="text-sm text-muted">Loading recurring payments…</p> : <Card className="divide-y divide-line overflow-hidden">
      {payments.length === 0 ? <EmptyState icon={<Repeat2 size={25} />} title="Keep track of regular bills" body="Add your internet fee, rent, or subscriptions. We’ll keep the payment history together." action={<Link href={`${recurringRoot}/new`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-ink"><Plus size={18} /> Add recurring payment</Link>} /> : payments.map((payment) => {
        const category = snapshot.categories.find((item) => item.id === payment.categoryId);
        return <Link key={payment.id} href={`${recurringRoot}/${payment.id}`} className="flex min-w-0 items-start gap-3 p-4 transition-colors hover:bg-slate-50">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-xl">{category?.emoji ?? "🔁"}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-extrabold">{payment.name}</p><p className="mt-1 text-xs text-muted">{recurringLabel(payment)} · {paymentStatus(payment)}</p><p className="mt-2 text-xs text-muted">{payment.status === "paused" ? "Automatic records paused" : `Next: ${paymentDateLabel(nextPaymentDate(payment))}`}</p></div>
          <div className="shrink-0 text-right"><p className="text-sm font-extrabold">{formatMoney(payment.amount, payment.currency)}</p><ChevronRight size={17} className="ml-auto mt-3 text-muted" /></div>
        </Link>;
      })}
    </Card>}
    <p className="text-center text-xs leading-5 text-muted">Personal only · Stored in your private Personal Data sheet</p>
  </div>;
}

export function RecurringPaymentDetailsScreen({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const { snapshot, hydrated, changeRecurringPayment, recurringError } = useBillMoshi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<"delete" | "skip">();
  const payment = snapshot.recurringPayments.find((item) => item.id === paymentId);
  const dialogRef = useDialogFocus<HTMLElement>(() => setConfirmAction(undefined), Boolean(confirmAction));
  if (!payment) return <div className="grid gap-5"><RecurringBack href={recurringRoot}>Recurring payments</RecurringBack><p>{hydrated ? "Recurring payment not found." : "Loading…"}</p></div>;
  const category = snapshot.categories.find((item) => item.id === payment.categoryId);
  const records = snapshot.records.filter((record) => record.recurringPaymentId === paymentId && !record.groupId && !record.eventId)
    .toSorted((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const next = nextPaymentDate(payment);
  const previous = records[0];
  const missingRates = records.filter((record) => record.baseCurrency !== snapshot.currentUser.defaultCurrency && !(record.reportingCurrency === snapshot.currentUser.defaultCurrency && record.amountReporting !== undefined)).length;

  async function change(action: "pause" | "resume" | "skip" | "delete") {
    setBusy(true); setError("");
    try {
      await changeRecurringPayment(paymentId, action);
      setConfirmAction(undefined);
      if (action === "delete") router.push(recurringRoot);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update this payment."); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-5">
    <RecurringBack href={recurringRoot}>Recurring payments</RecurringBack>
    <PageTitle title={payment.name} subtitle={`${category?.emoji ?? "🔁"} ${category?.name ?? "Expense"} · Personal only`} action={payment.status !== "deleted" && <Link href={`${recurringRoot}/${paymentId}/edit`} className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Edit recurring payment"><Pencil size={19} /></Link>} />
    <Card className="p-5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-muted">{recurringLabel(payment)}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${paymentStatus(payment) === "Active" ? "bg-success-soft text-success" : "bg-slate-100 text-muted"}`}>{paymentStatus(payment)}</span></div><p className="mt-4 break-words text-4xl font-extrabold tracking-tight">{formatMoney(payment.amount, payment.currency)}</p><p className="mt-3 text-xs text-muted">{payment.syncStatus === "synced" ? "Synced with Google Drive" : "Saved on this device · Pending sync"}</p></Card>
    <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
      <Card className="min-w-0 p-4"><p className="text-xs font-bold text-muted">Previous payment</p><p className="mt-2 font-extrabold">{previous ? formatMoney(previous.amountOriginal, previous.currencyOriginal) : "No payments yet"}</p>{previous && <Link href={`/records/${previous.id}`} className="mt-2 flex min-h-9 items-center gap-1 text-xs font-bold text-brand-dark">{paymentDateLabel(previous.recurringPaymentDate ?? previous.transactionDate.slice(0, 10))}<ChevronRight size={14} /></Link>}</Card>
      <Card className="min-w-0 p-4"><p className="text-xs font-bold text-muted">Next payment</p><p className="mt-2 font-extrabold">{payment.status === "paused" ? "Paused" : paymentDateLabel(next)}</p><p className="mt-2 text-xs leading-5 text-muted">{payment.status === "paused" ? "Resume to record future payments; paused dates are skipped." : next ? `${formatMoney(payment.amount, payment.currency)} · Created when you open the app on or after this date.` : "No further records will be created."}</p></Card>
    </div>
    <Card className="divide-y divide-line px-4">
      <DetailRow label="Schedule starts">{paymentDateLabel(payment.startDate)}</DetailRow>
      <DetailRow label="Repeat">{recurringLabel(payment)}</DetailRow>
      <DetailRow label="Ends">{payment.endDate ? paymentDateLabel(payment.endDate) : "No end date"}</DetailRow>
      <DetailRow label="Memo">{payment.note || "No memo"}</DetailRow>
    </Card>
    {(error || recurringError) && <p role="alert" className="break-words rounded-xl bg-danger-soft p-4 text-sm text-danger">{error || recurringError}</p>}
    {payment.status !== "deleted" && <div className="flex flex-wrap gap-2">
      {next && <Button variant="secondary" disabled={busy} onClick={() => void change(payment.status === "paused" ? "resume" : "pause")}>{payment.status === "paused" ? <Play size={17} /> : <Pause size={17} />}{payment.status === "paused" ? "Resume" : "Pause"}</Button>}
      {next && payment.status === "active" && <Button variant="secondary" disabled={busy} onClick={() => setConfirmAction("skip")}><SkipForward size={17} />Skip next</Button>}
      <Button variant="danger" disabled={busy} onClick={() => setConfirmAction("delete")}><Trash2 size={17} />Delete schedule</Button>
    </div>}
    {missingRates > 0 && <Link href="/records/missing-rates" className="rounded-xl bg-warning-soft p-4 text-sm font-bold text-warning">{missingRates} payment{missingRates === 1 ? " needs" : "s need"} a saved conversion rate. Add rates <ChevronRight size={14} className="inline" /></Link>}
    <section className="grid gap-3"><div><h2 className="text-lg font-extrabold">Past payment records</h2><p className="mt-1 text-xs text-muted">{records.length} records · Newest first · Includes pending sync</p></div>
      <Card className="divide-y divide-line overflow-hidden">{records.length === 0 ? <EmptyState icon={<Repeat2 size={23} />} title="No past payments" body="The first expense will appear here when its scheduled date arrives." /> : records.map((record) => <Link key={record.id} href={`/records/${record.id}`} className="flex min-w-0 items-center gap-3 p-4 hover:bg-slate-50"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-xl">{snapshot.categories.find((item) => item.id === record.categoryId)?.emoji ?? "🧾"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{record.description}</p><p className="mt-1 text-xs text-muted">{paymentDateLabel(record.recurringPaymentDate ?? record.transactionDate.slice(0, 10))}</p></div><div className="shrink-0 text-right"><p className="text-sm font-extrabold">{formatMoney(record.amountOriginal, record.currencyOriginal)}</p><p className={`mt-1 text-xs font-bold ${record.syncStatus === "synced" ? "text-success" : "text-warning"}`}>{record.syncStatus === "synced" ? "Synced" : "Pending"}</p></div><ChevronRight size={16} className="shrink-0 text-muted" /></Link>)}</Card>
    </section>
    {confirmAction && createPortal(<div role="dialog" aria-modal="true" aria-labelledby="recurring-confirm-title" className="fixed inset-0 z-[100] grid items-end bg-slate-950/40 p-4 sm:place-items-center"><section ref={dialogRef} className="animate-sheet-in mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><h2 id="recurring-confirm-title" className="text-lg font-extrabold">{confirmAction === "delete" ? "Delete recurring payment?" : "Skip next payment?"}</h2><button aria-label="Close confirmation" onClick={() => setConfirmAction(undefined)} disabled={busy} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50"><X size={20} /></button></div><p className="my-5 text-sm leading-6 text-muted">{confirmAction === "delete" ? `Stop “${payment.name}” permanently. All past records will be kept.` : `No record will be created for ${paymentDateLabel(next)}. The schedule will continue from the following date.`}</p>{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setConfirmAction(undefined)}>Cancel</Button><Button variant={confirmAction === "delete" ? "danger" : "primary"} disabled={busy} onClick={() => void change(confirmAction)}>{busy ? "Saving…" : confirmAction === "delete" ? "Delete schedule" : "Skip payment"}</Button></div></section></div>, document.body)}
  </div>;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-4 text-sm"><p className="font-bold">{label}</p><p className="whitespace-pre-wrap break-words text-right text-muted">{children}</p></div>;
}
