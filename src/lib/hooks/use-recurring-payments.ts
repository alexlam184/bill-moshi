"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ExchangeRateQuote } from "@/lib/domain/exchange-rates";
import { createRecurringRecord, duePaymentDates, resumeRecurringPayment, validateRecurringPayment } from "@/lib/domain/recurring-payments";
import { createClientId } from "@/lib/domain/client-id";
import type { AppSnapshot, RecurringPayment, RecurringPaymentInput } from "@/lib/domain/types";
import { commitRecurringOccurrences, persistRecurringPayment } from "@/lib/store/db";

export function useRecurringPayments(snapshot: AppSnapshot, setSnapshot: Dispatch<SetStateAction<AppSnapshot>>, ready: boolean, refreshPending: () => Promise<void>) {
  const [recurringError, setRecurringError] = useState("");
  const inFlight = useRef(false);

  const saveRecurringPayment = useCallback(async (input: RecurringPaymentInput, paymentId?: string) => {
    validateRecurringPayment(input);
    if (!snapshot.categories.some((category) => category.id === input.categoryId)) throw new Error("Choose an existing category.");
    const existing = paymentId ? snapshot.recurringPayments.find((item) => item.id === paymentId) : undefined;
    if (paymentId && (!existing || existing.status === "deleted")) throw new Error("Recurring payment is no longer available.");
    const scheduleChanged = !existing || existing.startDate !== input.startDate || existing.frequency !== input.frequency || existing.interval !== input.interval;
    const timestamp = new Date().toISOString();
    const payment: RecurringPayment = {
      ...input, name: input.name.trim(), note: input.note?.trim() || undefined,
      id: existing?.id ?? createClientId("recurring"),
      version: (existing?.version ?? 0) + 1,
      nextOccurrence: scheduleChanged ? 0 : existing.nextOccurrence,
      status: existing?.status ?? "active",
      createdBy: snapshot.currentUser.id, createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp, syncStatus: "pending",
    };
    await persistRecurringPayment(payment, snapshot);
    setSnapshot((current) => ({ ...current, recurringPayments: [...current.recurringPayments.filter((item) => item.id !== payment.id), payment] }));
    await refreshPending();
    return payment.id;
  }, [snapshot, setSnapshot, refreshPending]);

  const changeRecurringPayment = useCallback(async (paymentId: string, action: "pause" | "resume" | "skip" | "delete") => {
    const existing = snapshot.recurringPayments.find((item) => item.id === paymentId);
    if (!existing || existing.status === "deleted") throw new Error("Recurring payment is no longer available.");
    const payment: RecurringPayment = {
      ...(action === "resume" ? resumeRecurringPayment(existing) : existing),
      ...(action === "pause" ? { status: "paused" as const } : {}),
      ...(action === "delete" ? { status: "deleted" as const } : {}),
      ...(action === "skip" ? { nextOccurrence: existing.nextOccurrence + 1 } : {}),
      version: existing.version + 1, updatedAt: new Date().toISOString(), syncStatus: "pending",
    };
    await persistRecurringPayment(payment, snapshot);
    setSnapshot((current) => ({ ...current, recurringPayments: current.recurringPayments.map((item) => item.id === payment.id ? payment : item) }));
    await refreshPending();
  }, [snapshot, setSnapshot, refreshPending]);

  const processDue = useCallback(async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    try {
      const now = new Date();
      const quotes = new Map<string, ExchangeRateQuote | undefined>();
      for (const payment of snapshot.recurringPayments) {
        if (payment.createdBy !== snapshot.currentUser.id) continue;
        const dates = duePaymentDates(payment);
        if (!dates.length) continue;
        const currency = snapshot.currentUser.defaultCurrency;
        const quoteKey = `${payment.currency}:${currency}`;
        if (payment.currency !== currency && navigator.onLine && !quotes.has(quoteKey)) {
          let quote: ExchangeRateQuote | undefined;
          try {
            const response = await fetch(`/api/exchange-rates?from=${payment.currency}&to=${currency}`, { signal: AbortSignal.timeout(10000) });
            if (response.ok) quote = await response.json() as ExchangeRateQuote;
          } catch { /* Original currency is retained offline; conversion can be entered later. */ }
          quotes.set(quoteKey, quote);
        }
        const result = await commitRecurringOccurrences(payment, dates.map((date) => createRecurringRecord(payment, date, snapshot.currentUser, now, quotes.get(quoteKey))));
        if (!result) continue;
        setSnapshot((current) => ({
          ...current,
          recurringPayments: current.recurringPayments.map((item) => item.id === result.payment.id && item.version < result.payment.version ? result.payment : item),
          records: [...result.records.filter((record) => !current.records.some((item) => item.id === record.id)), ...current.records],
        }));
        await refreshPending();
      }
      setRecurringError("");
    } catch (error) {
      setRecurringError(error instanceof Error ? error.message : "Recurring payments could not be saved. Reopen the app to retry.");
    } finally {
      inFlight.current = false;
    }
  }, [ready, snapshot.recurringPayments, snapshot.currentUser, setSnapshot, refreshPending]);

  useEffect(() => {
    if (!ready) return;
    const run = () => { if (document.visibilityState === "visible") void processDue(); };
    run();
    const timer = setInterval(run, 60000);
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ready, processDue]);

  return { saveRecurringPayment, changeRecurringPayment, recurringError };
}
