"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { duePaymentDates, localDateKey, nextPaymentDate, validateRecurringPayment } from "@/lib/domain/recurring-payments";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type RecurringPayment, type RecurringPaymentInput } from "@/lib/domain/types";
import { RecurringBack, recurringRoot } from "./recurring-payments-screen";

export function RecurringPaymentFormScreen({ paymentId }: { paymentId?: string }) {
  const { snapshot, hydrated } = useBillMoshi();
  if (!hydrated) return <p role="status">Loading…</p>;
  const existing = paymentId ? snapshot.recurringPayments.find((item) => item.id === paymentId && item.status !== "deleted") : undefined;
  if (paymentId && !existing) return <div className="grid gap-4"><RecurringBack href={recurringRoot}>Recurring payments</RecurringBack><p>Recurring payment not found.</p></div>;
  return <PaymentForm key={paymentId ?? "new"} existing={existing} />;
}

function PaymentForm({ existing }: { existing?: RecurringPayment }) {
  const router = useRouter();
  const { snapshot, saveRecurringPayment } = useBillMoshi();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState<CurrencyCode>(existing?.currency ?? snapshot.currentUser.defaultCurrency);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? snapshot.categories.find((item) => item.id === "utilities")?.id ?? snapshot.categories.find((item) => !["transfer", "income"].includes(item.id))?.id ?? "");
  const [frequency, setFrequency] = useState<RecurringPayment["frequency"]>(existing?.frequency ?? "month");
  const [interval, setInterval] = useState(String(existing?.interval ?? 1));
  const [initialNextDate] = useState(existing ? nextPaymentDate(existing) ?? localDateKey() : localDateKey());
  const [startDate, setStartDate] = useState(initialNextDate);
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    try {
      const keepSchedule = existing && startDate === initialNextDate && frequency === existing.frequency && Number(interval) === existing.interval;
      const input: RecurringPaymentInput = { name, amount: Number(amount), currency, categoryId, frequency, interval: Number(interval), startDate: keepSchedule ? existing.startDate : startDate, endDate: endDate || undefined, note };
      validateRecurringPayment(input);
      if (existing && !keepSchedule && startDate < localDateKey()) throw new Error("Choose today or a future date when changing the schedule.");
      if (endDate && endDate < startDate) throw new Error("End date cannot be before the next payment.");
      setSaving(true);
      const id = await saveRecurringPayment(input, existing?.id);
      router.push(`${recurringRoot}/${id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this payment."); setSaving(false); }
  }

  let catchUp = 0;
  try { catchUp = duePaymentDates({ startDate, frequency, interval: Number(interval), nextOccurrence: 0, status: "active" } as RecurringPayment).length; } catch { /* Incomplete date input. */ }
  return <form ref={formRef} noValidate onSubmit={save} className="grid gap-5">
    <RecurringBack href={existing ? `${recurringRoot}/${existing.id}` : recurringRoot}>Cancel</RecurringBack>
    <PageTitle title={existing ? "Edit recurring payment" : "New recurring payment"} subtitle="Only for your personal expenses." action={<Button type="button" onClick={() => formRef.current?.requestSubmit()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>} />
    <Card className="grid gap-5 p-4 sm:p-5">
      <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-end gap-3 border-b border-line pb-5">
        <label className="grid gap-2 text-xs font-bold text-muted">Currency<select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="record-currency-display min-h-12 min-w-0 bg-transparent font-bold text-ink">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></label>
        <label className="grid min-w-0 gap-2 text-right text-xs font-bold text-muted">Amount<input aria-label="Amount" type="number" inputMode="decimal" min={currency === "JPY" ? 1 : 0.01} step={currency === "JPY" ? 1 : 0.01} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required className="record-amount-display min-h-16 w-full min-w-0 bg-transparent text-right text-ink placeholder:text-placeholder" /></label>
      </div>
      <Field label="Name"><input className={fieldClass} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Internet fee" required /></Field>
      <Field label="Category"><select className={fieldClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{snapshot.categories.filter((category) => !["transfer", "income"].includes(category.id)).map((category) => <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Repeat every"><input className={fieldClass} type="number" inputMode="numeric" min="1" max="365" step="1" value={interval} onChange={(event) => setInterval(event.target.value)} required /></Field><Field label="Period"><select className={fieldClass} value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringPayment["frequency"])}><option value="day">Day(s)</option><option value="week">Week(s)</option><option value="month">Month(s)</option><option value="year">Year(s)</option></select></Field></div>
      <Field label={existing ? "Next payment date" : "First payment date"} hint="Monthly payments use the last day of a shorter month, then return to the original day."><input className={fieldClass} type="date" value={startDate} onInput={(event) => setStartDate(event.currentTarget.value)} onChange={(event) => setStartDate(event.target.value)} required /></Field>
      <Field label="End date" hint="Optional. Includes payments due on this date."><input className={fieldClass} type="date" value={endDate} min={startDate} onInput={(event) => setEndDate(event.currentTarget.value)} onChange={(event) => setEndDate(event.target.value)} /></Field>
      <Field label="Memo"><textarea className={`${fieldClass} py-3`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional payment details" /></Field>
    </Card>
    {error && <p role="alert" aria-live="assertive" className="break-words rounded-xl bg-danger-soft p-4 text-sm leading-6 text-danger">{error}</p>}
    {!existing && catchUp > 0 && <p className="rounded-xl bg-warning-soft p-4 text-sm leading-6 text-warning">Saving will create {catchUp === 90 ? "at least " : ""}{catchUp} due personal record{catchUp === 1 ? "" : "s"}. Choose a future date to start later.</p>}
    <p className="text-xs leading-5 text-muted">{existing ? "Edits apply only to future payments. Past records stay unchanged. " : ""}Payments are recorded when the app is open. Foreign-currency payments use the available exchange rate when created; if unavailable, you can supply the conversion later.</p>
  </form>;
}
