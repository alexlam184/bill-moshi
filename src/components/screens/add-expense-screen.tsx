"use client";

import { CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Layers3, Paperclip, RefreshCw, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Card } from "@/components/ui/primitives";
import { allocateSplits, formatMoney, roundMoney } from "@/lib/domain/calculations";
import { resolveRecordBaseCurrency, shouldFetchAutomaticExchangeRate, type ExchangeRateQuote } from "@/lib/domain/exchange-rates";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type RecordType, type SplitMethod } from "@/lib/domain/types";

type RateStatus = "idle" | "loading" | "automatic" | "manual" | "error";

const methods: Array<{ id: SplitMethod; label: string; hint: string }> = [
  { id: "equal", label: "Equal", hint: "Everyone pays the same" },
  { id: "exact", label: "Exact", hint: "Set each amount" },
  { id: "percentage", label: "%", hint: "Split by percentage" },
];

interface AddExpenseScreenProps {
  initialGroupId?: string;
  initialEventId?: string;
  initialPersonal?: boolean;
  editingExpenseId?: string;
}

export function AddExpenseScreen({ initialGroupId, initialEventId, initialPersonal = false, editingExpenseId }: AddExpenseScreenProps) {
  const router = useRouter();
  const { snapshot, selectedGroupId, personalContext, selectGroup: setCurrentGroup, selectPersonal, hydrated, addExpense, updateExpense } = useBillMoshi();
  const editingExpense = snapshot.expenses.find((expense) => expense.id === editingExpenseId);
  const requestedEvent = snapshot.events.find((event) => event.id === initialEventId);
  const startsPersonal = Boolean((editingExpense && !editingExpense.groupId) || initialPersonal || (!editingExpenseId && !initialGroupId && !initialEventId && personalContext));
  const [personal, setPersonal] = useState(startsPersonal);
  const [groupId, setGroupId] = useState(
    startsPersonal ? "" : editingExpense?.groupId ?? initialGroupId ?? requestedEvent?.groupId ?? selectedGroupId ?? snapshot.groups[0]?.id ?? "",
  );
  const [eventId, setEventId] = useState(editingExpense?.eventId ?? initialEventId ?? "");
  const event = snapshot.events.find((item) => item.id === eventId && item.groupId === groupId);
  const group = snapshot.groups.find((item) => item.id === groupId);
  const baseCurrency = resolveRecordBaseCurrency({
    defaultCurrency: snapshot.currentUser.defaultCurrency,
    groupCurrency: group?.currency,
    eventCurrency: event?.baseCurrency,
    storedBaseCurrency: editingExpense?.baseCurrency,
  });
  const groupEvents = useMemo(
    () => snapshot.events.filter((item) => item.groupId === groupId),
    [groupId, snapshot.events],
  );
  const activeEventId = event?.id;
  const members = personal
    ? [{ id: snapshot.currentUser.id, userId: snapshot.currentUser.id, name: snapshot.currentUser.name, email: snapshot.currentUser.email, role: "owner" as const, status: "active" as const, joinedAt: "", avatarColor: "#2F80ED" }]
    : event?.id
      ? snapshot.members.filter((member) => member.eventId === event.id && member.status === "active")
      : snapshot.groupMembers.filter((member) => member.groupId === groupId && member.status === "active");
  const [amount, setAmount] = useState("");
  const [recordType, setRecordType] = useState<RecordType>(editingExpense?.recordType ?? "expense");
  const [currency, setCurrency] = useState<CurrencyCode>(() => (
    editingExpense?.currencyOriginal
      ?? requestedEvent?.baseCurrency
      ?? (startsPersonal
        ? snapshot.currentUser.defaultCurrency
        : snapshot.groups.find((item) => item.id === (initialGroupId ?? selectedGroupId ?? snapshot.groups[0]?.id))?.currency
          ?? snapshot.currentUser.defaultCurrency)
  ));
  const [exchangeRate, setExchangeRate] = useState("1");
  const [exchangeRateSource, setExchangeRateSource] = useState<"automatic" | "manual">(editingExpense?.exchangeRateSource === "automatic" ? "automatic" : "manual");
  const [exchangeRateDate, setExchangeRateDate] = useState(editingExpense?.exchangeRateDate ?? "");
  const [rateStatus, setRateStatus] = useState<RateStatus>(editingExpense?.exchangeRateSource === "automatic" ? "automatic" : "idle");
  const [rateError, setRateError] = useState("");
  const [automaticRateEnabled, setAutomaticRateEnabled] = useState(!editingExpenseId);
  const [rateRequestVersion, setRateRequestVersion] = useState(0);
  const reportingCurrency = snapshot.currentUser.defaultCurrency;
  const [reportingRate, setReportingRate] = useState(editingExpense?.baseToReportingRate ? String(editingExpense.baseToReportingRate) : "");
  const [reportingRateSource, setReportingRateSource] = useState<"automatic" | "manual">(editingExpense?.reportingRateSource === "automatic" ? "automatic" : "manual");
  const [reportingRateDate, setReportingRateDate] = useState(editingExpense?.reportingRateDate ?? "");
  const [reportingRateStatus, setReportingRateStatus] = useState<RateStatus>(editingExpense?.reportingRateSource === "automatic" ? "automatic" : "idle");
  const [reportingRateError, setReportingRateError] = useState("");
  const [reportingAutomaticEnabled, setReportingAutomaticEnabled] = useState(!editingExpenseId);
  const [reportingRequestVersion, setReportingRequestVersion] = useState(0);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("food");
  const [payerId, setPayerId] = useState("");
  const [selected, setSelected] = useState<string[]>(() => editingExpense
    ? editingExpense.splits.map((split) => split.memberId)
    : defaultSplitMemberIds(members, snapshot.currentUser.id));
  const [method, setMethod] = useState<SplitMethod>("equal");
  const [values, setValues] = useState<Record<string, string>>({});
  const [splitEditorOpen, setSplitEditorOpen] = useState(false);
  const [draftMethod, setDraftMethod] = useState<SplitMethod>("equal");
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const initializedEdit = useRef(false);
  const initializedScope = useRef("");
  const initializedHydratedCurrency = useRef(false);
  const automaticRateEligible = shouldFetchAutomaticExchangeRate({
    isNewRecord: !editingExpenseId,
    currency,
    baseCurrency,
  });
  const reportingRateEligible = Boolean(!editingExpenseId && baseCurrency !== reportingCurrency && currency !== reportingCurrency);

  useEffect(() => {
    if (!hydrated || editingExpenseId || initializedHydratedCurrency.current) return;
    initializedHydratedCurrency.current = true;
    queueMicrotask(() => {
      setCurrency(personal ? snapshot.currentUser.defaultCurrency : event?.baseCurrency ?? group?.currency ?? snapshot.currentUser.defaultCurrency);
      setExchangeRate("1");
      setAutomaticRateEnabled(true);
      setRateStatus("idle");
    });
  }, [editingExpenseId, event?.baseCurrency, group?.currency, hydrated, personal, snapshot.currentUser.defaultCurrency]);

  useEffect(() => {
    if (!requestedEvent || editingExpenseId) return;
    queueMicrotask(() => {
      setCurrentGroup(requestedEvent.groupId);
      setPersonal(false);
      setGroupId(requestedEvent.groupId);
      setCurrency(requestedEvent.baseCurrency);
      setExchangeRate("1");
      setRateStatus("idle");
    });
  }, [editingExpenseId, requestedEvent, setCurrentGroup]);

  useEffect(() => {
    if (editingExpenseId || initialGroupId || initialEventId || personal || !selectedGroupId || selectedGroupId === groupId) return;
    queueMicrotask(() => {
      initializedScope.current = "";
      setGroupId(selectedGroupId);
      setEventId("");
      setCurrency(snapshot.groups.find((item) => item.id === selectedGroupId)?.currency ?? snapshot.currentUser.defaultCurrency);
      setExchangeRate("1");
      setRateStatus("idle");
      setPayerId("");
      setSelected([]);
      setValues({});
    });
  }, [editingExpenseId, groupId, initialEventId, initialGroupId, personal, selectedGroupId, snapshot.currentUser.defaultCurrency, snapshot.groups]);

  useEffect(() => {
    if (editingExpenseId || initialGroupId || initialEventId || !personalContext || personal) return;
    queueMicrotask(() => {
      initializedScope.current = "";
      setPersonal(true);
      setRecordType("expense");
      setGroupId("");
      setEventId("");
      setCurrency(snapshot.currentUser.defaultCurrency);
      setExchangeRate("1");
      setRateStatus("idle");
      setPayerId("");
      setSelected([]);
      setValues({});
    });
  }, [editingExpenseId, initialEventId, initialGroupId, personal, personalContext, snapshot.currentUser.defaultCurrency]);

  useEffect(() => {
    if (editingExpenseId || !initialGroupId || initialGroupId === selectedGroupId || !snapshot.groups.some((item) => item.id === initialGroupId)) return;
    queueMicrotask(() => setCurrentGroup(initialGroupId));
  }, [editingExpenseId, initialGroupId, selectedGroupId, setCurrentGroup, snapshot.groups]);

  useEffect(() => {
    if (editingExpenseId || !initialPersonal || personalContext) return;
    queueMicrotask(() => selectPersonal());
  }, [editingExpenseId, initialPersonal, personalContext, selectPersonal]);

  useEffect(() => {
    if (!editingExpense || initializedEdit.current) return;
    initializedEdit.current = true;
    setPersonal(!editingExpense.groupId);
    setRecordType(editingExpense.recordType);
    setGroupId(editingExpense.groupId ?? "");
    setEventId(editingExpense.eventId ?? "");
    setAmount(String(editingExpense.amountOriginal));
    setCurrency(editingExpense.currencyOriginal);
    setExchangeRate(String(editingExpense.exchangeRate));
    setExchangeRateSource(editingExpense.exchangeRateSource === "automatic" ? "automatic" : "manual");
    setExchangeRateDate(editingExpense.exchangeRateDate ?? editingExpense.transactionDate.slice(0, 10));
    setRateStatus(editingExpense.exchangeRateSource === "automatic" ? "automatic" : "manual");
    setAutomaticRateEnabled(false);
    setReportingRate(editingExpense.baseToReportingRate ? String(editingExpense.baseToReportingRate) : "");
    setReportingRateSource(editingExpense.reportingRateSource === "automatic" ? "automatic" : "manual");
    setReportingRateDate(editingExpense.reportingRateDate ?? editingExpense.transactionDate.slice(0, 10));
    setReportingRateStatus(editingExpense.reportingRateSource === "automatic" ? "automatic" : editingExpense.baseToReportingRate ? "manual" : "idle");
    setReportingAutomaticEnabled(false);
    setDescription(editingExpense.description);
    setCategoryId(editingExpense.categoryId);
    setPayerId(editingExpense.payerId);
    setSelected(editingExpense.splits.map((split) => split.memberId));
    const storedSplitMethod = editingExpense.splits[0]?.splitMethod ?? "equal";
    const splitMethod = storedSplitMethod === "shares" ? "exact" : storedSplitMethod;
    setMethod(splitMethod);
    setValues(Object.fromEntries(editingExpense.splits.map((split) => [
      split.memberId,
      String(splitMethod === "percentage" ? split.percentage ?? 0 : split.owedAmount),
    ])));
    setDate(toLocalDateTimeInputValue(editingExpense.transactionDate));
    setNotes(editingExpense.notes ?? "");
  }, [editingExpense]);

  const scopeKey = personal ? "personal" : event ? `event:${event.id}` : group ? `group:${group.id}` : "";
  useEffect(() => {
    const scopeMembers = personal
      ? [{ id: snapshot.currentUser.id, userId: snapshot.currentUser.id }]
      : activeEventId
        ? snapshot.members.filter((member) => member.eventId === activeEventId && member.status === "active")
        : snapshot.groupMembers.filter((member) => member.groupId === groupId && member.status === "active");
    if (editingExpenseId || !scopeKey || scopeMembers.length === 0 || initializedScope.current === scopeKey) return;
    initializedScope.current = scopeKey;
    setPayerId(scopeMembers[0].id);
    setSelected(defaultSplitMemberIds(scopeMembers, snapshot.currentUser.id));
    setValues({});
  }, [activeEventId, editingExpenseId, groupId, personal, scopeKey, snapshot.currentUser.id, snapshot.groupMembers, snapshot.members]);

  useEffect(() => {
    if (currency === baseCurrency) {
      queueMicrotask(() => {
        setExchangeRate("1");
        setExchangeRateDate(date.slice(0, 10));
        setRateStatus("idle");
        setRateError("");
      });
      return;
    }
    if (!automaticRateEnabled || !automaticRateEligible) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      setExchangeRate("");
      setRateStatus("loading");
      setRateError("");
    });
    void fetch(`/api/exchange-rates?from=${currency}&to=${baseCurrency}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ExchangeRateQuote | { error?: string };
        if (!response.ok || !("rate" in body)) throw new Error("error" in body ? body.error : "Could not load the exchange rate.");
        setExchangeRate(formatExchangeRate(body.rate));
        setExchangeRateSource("automatic");
        setExchangeRateDate(body.effectiveAt.slice(0, 10));
        setRateStatus("automatic");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setExchangeRateSource("manual");
        setExchangeRateDate(date.slice(0, 10));
        setRateStatus("error");
        setRateError(caught instanceof Error ? caught.message : "CBSA exchange rates are unavailable.");
      });
    return () => controller.abort();
  }, [automaticRateEligible, automaticRateEnabled, baseCurrency, currency, date, rateRequestVersion]);

  useEffect(() => {
    if (baseCurrency === reportingCurrency) {
      queueMicrotask(() => {
        setReportingRate("1");
        setReportingRateDate(date.slice(0, 10));
        setReportingRateStatus("idle");
        setReportingRateError("");
      });
      return;
    }
    if (currency === reportingCurrency) {
      if (editingExpenseId) return;
      queueMicrotask(() => {
        setReportingRate("");
        setReportingRateDate(exchangeRateDate || date.slice(0, 10));
        setReportingRateStatus("idle");
        setReportingRateError("");
      });
      return;
    }
    if (!reportingRateEligible || !reportingAutomaticEnabled) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      setReportingRate("");
      setReportingRateStatus("loading");
      setReportingRateError("");
    });
    void fetch(`/api/exchange-rates?from=${baseCurrency}&to=${reportingCurrency}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ExchangeRateQuote | { error?: string };
        if (!response.ok || !("rate" in body)) throw new Error("error" in body ? body.error : "Could not load the All Groups exchange rate.");
        setReportingRate(formatExchangeRate(body.rate));
        setReportingRateSource("automatic");
        setReportingRateDate(body.effectiveAt.slice(0, 10));
        setReportingRateStatus("automatic");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setReportingRateSource("manual");
        setReportingRateDate(date.slice(0, 10));
        setReportingRateStatus("error");
        setReportingRateError(caught instanceof Error ? caught.message : "CBSA exchange rates are unavailable.");
      });
    return () => controller.abort();
  }, [baseCurrency, currency, date, editingExpenseId, exchangeRateDate, reportingAutomaticEnabled, reportingCurrency, reportingRateEligible, reportingRequestVersion]);

  const originalAmount = Number(amount) || 0;
  const rate = currency !== baseCurrency ? Number(exchangeRate) || 0 : 1;
  const baseAmount = roundMoney(originalAmount * rate, baseCurrency);
  const enteredReportingRate = Number(reportingRate) || 0;
  const baseToReportingRate = baseCurrency === reportingCurrency
    ? 1
    : enteredReportingRate > 0
      ? enteredReportingRate
      : currency === reportingCurrency && rate > 0
        ? 1 / rate
        : 0;
  const reportingAmount = roundMoney(baseAmount * baseToReportingRate, reportingCurrency);
  const selectedSplitMembers = selected.flatMap((memberId) => {
    const member = members.find((item) => item.id === memberId);
    return member ? [member] : [];
  });
  const splitConfigurationError = recordType === "transfer" ? "" : validateSplitConfiguration(baseAmount, baseCurrency, method, selected, values);
  const savedSplitAmounts = previewSplitAmounts(baseAmount, baseCurrency, method, selected, values);

  function toggleMember(memberId: string) {
    if (recordType === "transfer") {
      if (memberId === payerId) return;
      setSelected([memberId]);
      return;
    }
    setSelected((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  }

  function openSplitEditor() {
    setDraftMethod(method);
    setDraftSelected(selected);
    setDraftValues(values);
    setSplitEditorOpen(true);
  }

  function saveSplitEditor() {
    const validationError = validateSplitConfiguration(baseAmount, baseCurrency, draftMethod, draftSelected, draftValues);
    if (validationError) return;
    setMethod(draftMethod);
    setSelected(draftSelected);
    setValues(draftValues);
    setSplitEditorOpen(false);
  }

  function changeRecordType(nextType: RecordType) {
    if (nextType === "transfer" && personal) return;
    setRecordType(nextType);
    setError("");
    setValues({});
    if (nextType === "transfer") {
      const senderId = payerId || members[0]?.id || "";
      const recipient = members.find((member) => member.id !== senderId);
      setPayerId(senderId);
      setSelected(recipient ? [recipient.id] : []);
      setMethod("exact");
      setCategoryId("transfer");
    } else {
      setSelected(defaultSplitMemberIds(members, snapshot.currentUser.id));
      setMethod("equal");
      setCategoryId(nextType === "income" ? "income" : "food");
    }
  }

  function changeGroup(nextGroupId: string) {
    initializedScope.current = "";
    setPersonal(false);
    setCurrentGroup(nextGroupId);
    setGroupId(nextGroupId);
    setEventId("");
    setCurrency(snapshot.groups.find((item) => item.id === nextGroupId)?.currency ?? snapshot.currentUser.defaultCurrency);
    setExchangeRate("1");
    setAutomaticRateEnabled(true);
    setRateStatus("idle");
    setPayerId("");
    setSelected([]);
    setValues({});
  }

  function selectEvent(nextEventId: string) {
    const nextEvent = snapshot.events.find((item) => item.id === nextEventId && item.groupId === groupId);
    initializedScope.current = "";
    setEventId(nextEventId);
    setCurrency(nextEvent?.baseCurrency ?? group?.currency ?? snapshot.currentUser.defaultCurrency);
    setExchangeRate("1");
    setAutomaticRateEnabled(true);
    setRateStatus("idle");
    setPayerId("");
    setSelected([]);
    setValues({});
  }

  function changeCurrency(nextCurrency: CurrencyCode) {
    setCurrency(nextCurrency);
    setRateError("");
    if (nextCurrency === baseCurrency) {
      setExchangeRate("1");
      setExchangeRateDate(date.slice(0, 10));
      setAutomaticRateEnabled(false);
      setRateStatus("idle");
      return;
    }
    setExchangeRate("");
    setExchangeRateSource("manual");
    setExchangeRateDate(date.slice(0, 10));
    setAutomaticRateEnabled(!editingExpenseId);
    setRateStatus(editingExpenseId ? "manual" : "loading");
  }

  function changeExchangeRate(value: string) {
    setExchangeRate(value);
    setExchangeRateSource("manual");
    setExchangeRateDate(date.slice(0, 10));
    setAutomaticRateEnabled(false);
    setRateStatus("manual");
    setRateError("");
  }

  function changeReportingRate(value: string) {
    setReportingRate(value);
    setReportingRateSource("manual");
    setReportingRateDate(date.slice(0, 10));
    setReportingAutomaticEnabled(false);
    setReportingRateStatus("manual");
    setReportingRateError("");
  }

  function refreshExchangeRate() {
    if (!automaticRateEligible) return;
    setExchangeRate("");
    setAutomaticRateEnabled(true);
    setRateStatus("loading");
    setRateError("");
    setRateRequestVersion((version) => version + 1);
  }

  function refreshReportingRate() {
    if (!reportingRateEligible) return;
    setReportingRate("");
    setReportingAutomaticEnabled(true);
    setReportingRateStatus("loading");
    setReportingRateError("");
    setReportingRequestVersion((version) => version + 1);
  }

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError("");
    if (!personal && !group) return setError("Choose a group or select Myself.");
    if (recordType !== "transfer" && !description.trim()) return setError("Add a short description.");
    if (originalAmount <= 0) return setError("Amount must be above zero.");
    if (rateStatus === "loading") return setError("Wait for the automatic exchange rate, or enter a manual rate.");
    if (rate <= 0) return setError("Exchange rate must be above zero.");
    if (baseCurrency !== reportingCurrency && baseToReportingRate <= 0) return setError(`Enter the ${baseCurrency} to ${reportingCurrency} rate for All Groups.`);
    if (!payerId || selected.length === 0) return setError(recordType === "transfer" ? "Choose a sender and recipient." : "Choose a person and at least one participant.");
    if (recordType === "transfer" && (personal || selected.length !== 1 || selected[0] === payerId)) return setError("Choose one different member to receive the transfer.");
    setSaving(true);
    const input = {
      groupId: personal ? undefined : groupId,
      eventId: event?.id,
      recordType,
      description: description.trim() || "Transfer",
      categoryId,
      transactionDate: date,
      payerId,
      amountOriginal: originalAmount,
      currencyOriginal: currency,
      baseCurrency,
      exchangeRate: rate,
      exchangeRateSource: currency === baseCurrency ? "same-currency" as const : exchangeRateSource,
      exchangeRateDate: currency === baseCurrency ? date.slice(0, 10) : exchangeRateSource === "automatic" ? exchangeRateDate : date.slice(0, 10),
      exchangeRateProvider: currency !== baseCurrency && exchangeRateSource === "automatic" ? "CBSA" : undefined,
      reportingCurrency,
      baseToReportingRate,
      reportingRateSource: baseCurrency === reportingCurrency ? "same-currency" as const : currency === reportingCurrency ? "derived" as const : reportingRateSource,
      reportingRateDate: baseCurrency === reportingCurrency ? date.slice(0, 10) : currency === reportingCurrency ? exchangeRateDate || date.slice(0, 10) : reportingRateDate,
      reportingRateProvider: baseCurrency !== reportingCurrency && currency !== reportingCurrency && reportingRateSource === "automatic" ? "CBSA" : undefined,
      splitMethod: method,
      splitInputs: selected.map((memberId) => ({ memberId, value: recordType === "transfer" ? baseAmount : method === "equal" ? undefined : Number(values[memberId]) || 0 })),
      notes,
      receipt,
    };
    try {
      if (editingExpenseId) await updateExpense(editingExpenseId, input);
      else await addExpense(input);
      router.push(editingExpenseId
        ? `/expenses/${editingExpenseId}`
        : personal ? "/records/mine" : event ? `/events/${event.id}` : `/groups/${groupId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the record.");
    } finally {
      setSaving(false);
    }
  }

  if (editingExpenseId && hydrated && !editingExpense) return <Card className="p-8 text-center"><h1 className="font-extrabold">Expense not found</h1><Link href="/" className="mt-4 inline-block text-sm font-bold text-brand-dark">Back home</Link></Card>;
  if (snapshot.groups.length === 0 && !personal) return <Card className="p-8 text-center"><h1 className="text-xl font-extrabold">Choose how to record it</h1><p className="mt-2 text-sm text-muted">Use Myself for a personal expense, or create a group for shared spending.</p><div className="mt-5 flex justify-center gap-3"><Link href="/expenses/new?personal=1" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-[#103a55]">Use Myself</Link><Link href="/groups/new" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-bold">Create group</Link></div></Card>;

  const backHref = editingExpenseId
    ? `/expenses/${editingExpenseId}`
    : personal ? "/records/mine" : event ? `/events/${event.id}` : group ? `/groups/${group.id}` : "/";
  const groupIsCurrentContext = Boolean(group && (editingExpenseId || initialGroupId || initialEventId || selectedGroupId));
  const canSubmit = Boolean(
    (personal || group)
    && (recordType === "transfer" || description.trim())
    && originalAmount > 0
    && rate > 0
    && (baseCurrency === reportingCurrency || baseToReportingRate > 0)
    && payerId
    && selected.length > 0
    && !splitConfigurationError
    && (recordType !== "transfer" || (!personal && selected.length === 1 && selected[0] !== payerId)),
  );
  const category = snapshot.categories.find((item) => item.id === categoryId);
  const payer = members.find((member) => member.id === payerId);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[680px] overflow-hidden bg-white animate-rise md:min-h-0 md:rounded-[1.75rem] md:border md:border-line md:shadow-[0_18px_50px_rgba(44,90,122,0.12)]">
      <header className="sticky top-0 z-20 grid h-[76px] grid-cols-[64px_1fr_80px] items-center bg-white/95 px-4 backdrop-blur">
        <Link href={backHref} aria-label="Close new record" className="grid size-12 place-items-center rounded-full border border-line bg-white text-muted shadow-sm transition hover:bg-slate-50 hover:text-ink"><X size={25} strokeWidth={2.4} /></Link>
        <h1 className="text-center text-xl font-extrabold tracking-[-0.03em]">{editingExpenseId ? "Edit Record" : "New Record"}</h1>
        <button form="expense-record-form" type="submit" disabled={!canSubmit || saving} className="min-h-11 rounded-full bg-brand px-4 text-sm font-extrabold text-[#103a55] transition enabled:hover:bg-[#62afe5] disabled:bg-slate-100 disabled:text-slate-400">{saving ? "Saving" : "Done"}</button>
      </header>

      <div className="grid grid-cols-3 border-b border-line px-5" role="tablist" aria-label="Record type">
        {(["expense", "income", "transfer"] as const).map((type) => {
          const disabled = type === "transfer" && personal;
          return <button key={type} type="button" role="tab" aria-selected={recordType === type} disabled={disabled} title={disabled ? "Choose a group to transfer between members" : undefined} onClick={() => changeRecordType(type)} className={`relative min-h-14 text-sm capitalize transition ${recordType === type ? "font-extrabold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-t-full after:bg-brand" : disabled ? "font-bold text-slate-300" : "font-bold text-muted hover:text-ink"}`}>{type}</button>;
        })}
      </div>

      <form id="expense-record-form" onSubmit={submit} className="px-5 pb-12">
        <section className="grid grid-cols-[46%_54%] items-center border-b border-line py-8">
          <label className="relative flex w-fit items-center gap-2">
            <span className="sr-only">Currency</span>
            <select aria-label="Currency" value={currency} onChange={(changeEvent) => changeCurrency(changeEvent.target.value as CurrencyCode)} className="record-currency-display max-w-full appearance-none bg-transparent pr-8 font-extrabold outline-none">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select>
            <ChevronDown className="pointer-events-none absolute right-0 text-muted" size={20} />
          </label>
          <input aria-label="Amount" inputMode="decimal" className="record-amount-display min-w-0 bg-transparent text-right font-extrabold outline-none placeholder:text-slate-300" placeholder="0" value={amount} onChange={(changeEvent) => setAmount(changeEvent.target.value)} />
        </section>

        <RecordRow label="Date">
          <button type="button" onClick={() => setDateEditorOpen(true)} aria-haspopup="dialog" className="flex min-h-8 w-full items-center justify-end gap-2 text-right text-sm font-bold text-muted transition hover:text-ink"><CalendarDays size={17} className="text-brand-dark" /><span>{formatRecordDate(date)}</span><ChevronRight size={16} className="text-slate-300" /></button>
        </RecordRow>

        <RecordRow label="Group">
          {personal ? <div aria-label="Personal account" className="flex items-center justify-end gap-2 text-right"><UserRound size={17} className="text-brand-dark" /><span className="min-w-0 truncate text-sm font-extrabold">Myself</span><span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-1 text-[0.65rem] font-extrabold text-brand-dark">Personal</span></div> : groupIsCurrentContext ? <div aria-label="Current group" className="flex items-center justify-end gap-2 text-right"><span>{group?.emoji}</span><span className="min-w-0 truncate text-sm font-extrabold">{group?.name}</span><span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-[0.65rem] font-extrabold text-brand-dark"><Layers3 size={12} /> Current</span></div> : <div className="relative"><select aria-label="Group" value={groupId} onChange={(changeEvent) => changeGroup(changeEvent.target.value)} className="w-full appearance-none bg-transparent pr-6 text-right text-sm font-extrabold outline-none">{snapshot.groups.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-0 top-0.5 text-muted" size={17} /></div>}
        </RecordRow>

        <RecordRow label="Event">
          {personal ? <p className="text-right text-sm font-bold text-muted">No event · Personal record</p> : <div className="relative">
            <select aria-label="Event" value={event?.id ?? ""} disabled={Boolean(editingExpenseId)} onChange={(changeEvent) => selectEvent(changeEvent.target.value)} className="w-full appearance-none bg-transparent pr-6 text-right text-sm font-bold text-muted outline-none disabled:opacity-60">
              <option value="">No event · Daily record</option>
              {groupEvents.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-0.5 text-muted" size={17} />
          </div>}
        </RecordRow>

        {currency !== baseCurrency && <RecordRow label="Rate"><div className="grid justify-items-end gap-2"><span className="text-xs font-bold text-muted">{formatMoney(originalAmount, currency)} → {formatMoney(baseAmount, baseCurrency)}</span><div className="flex items-center gap-2"><input aria-label={`Exchange rate to ${baseCurrency}`} inputMode="decimal" className="w-28 rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold outline-none focus:ring-2 focus:ring-brand" value={exchangeRate} onChange={(changeEvent) => changeExchangeRate(changeEvent.target.value)} placeholder={rateStatus === "loading" ? "Loading…" : "Rate"} />{automaticRateEligible && <button type="button" onClick={refreshExchangeRate} disabled={rateStatus === "loading"} className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand-dark disabled:opacity-60" aria-label="Refresh automatic CBSA exchange rate"><RefreshCw size={15} className={rateStatus === "loading" ? "animate-spin" : ""} /></button>}</div><p className={`text-right text-[0.68rem] font-bold ${rateStatus === "error" ? "text-danger" : rateStatus === "automatic" ? "text-success" : "text-muted"}`}>{rateStatus === "loading" ? "Getting the latest CBSA rate…" : rateStatus === "automatic" ? `CBSA automatic · 1 ${currency} → ${exchangeRate} ${baseCurrency} · effective ${formatRateDate(exchangeRateDate)}` : rateStatus === "error" ? `${rateError} Enter a manual rate.` : editingExpenseId ? `Editing existing record · enter rate manually` : `Manual · 1 ${currency} → ${exchangeRate || "—"} ${baseCurrency}`}</p></div></RecordRow>}

        {baseCurrency !== reportingCurrency && <RecordRow label="All Groups"><div className="grid justify-items-end gap-2"><span className="text-xs font-bold text-muted">{formatMoney(baseAmount, baseCurrency)} → {formatMoney(reportingAmount, reportingCurrency)}</span>{currency === reportingCurrency && rate > 0 && !reportingRate ? <p className="text-right text-xs font-extrabold text-success">Derived · 1 {baseCurrency} → {formatExchangeRate(baseToReportingRate)} {reportingCurrency}</p> : <><div className="flex items-center gap-2"><input aria-label={`All Groups exchange rate to ${reportingCurrency}`} inputMode="decimal" className="w-28 rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold outline-none focus:ring-2 focus:ring-brand" value={reportingRate} onChange={(changeEvent) => changeReportingRate(changeEvent.target.value)} placeholder={reportingRateStatus === "loading" ? "Loading…" : "Rate"} />{reportingRateEligible && <button type="button" onClick={refreshReportingRate} disabled={reportingRateStatus === "loading"} className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand-dark disabled:opacity-60" aria-label="Refresh All Groups CBSA exchange rate"><RefreshCw size={15} className={reportingRateStatus === "loading" ? "animate-spin" : ""} /></button>}</div><p className={`text-right text-[0.68rem] font-bold ${reportingRateStatus === "error" ? "text-danger" : reportingRateStatus === "automatic" ? "text-success" : "text-muted"}`}>{reportingRateStatus === "loading" ? "Getting the All Groups rate…" : reportingRateStatus === "automatic" ? `CBSA automatic · 1 ${baseCurrency} → ${reportingRate} ${reportingCurrency}` : reportingRateStatus === "error" ? `${reportingRateError} Enter a manual rate.` : `Reporting rate · 1 ${baseCurrency} → ${reportingRate || "—"} ${reportingCurrency}`}</p></>}</div></RecordRow>}

        <RecordRow label="Category">
          {recordType === "transfer" ? <div className="flex items-center gap-2 text-sm font-bold"><span>↔️</span> Transfer</div> : <div className="relative flex items-center gap-2"><span>{category?.emoji}</span><select aria-label="Category" className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm font-bold outline-none" value={categoryId} onChange={(changeEvent) => setCategoryId(changeEvent.target.value)}>{snapshot.categories.filter((item) => item.id !== "transfer").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-0 text-muted" size={17} /></div>}
        </RecordRow>

        <RecordRow label="Name">
          <input aria-label="Name" className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" placeholder={recordType === "expense" ? "What was it for?" : recordType === "income" ? "Where did it come from?" : "Transfer (optional name)"} value={description} onChange={(changeEvent) => setDescription(changeEvent.target.value)} />
        </RecordRow>

        <RecordRow label="Memo" alignStart>
          <div className="flex min-w-0 items-start gap-2">
            <textarea aria-label="Memo" rows={2} className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400" value={notes} onChange={(changeEvent) => setNotes(changeEvent.target.value)} placeholder="Tap to edit (optional)" />
            <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Attach receipt"><Camera size={19} /><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(changeEvent) => setReceipt(changeEvent.target.files?.[0])} /></label>
          </div>
          {(receipt || editingExpense?.receiptName) && <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-bold text-brand-dark"><Paperclip size={13} /> {receipt?.name ?? editingExpense?.receiptName}</p>}
        </RecordRow>

        <RecordRow label={recordType === "expense" ? "Paid by" : recordType === "income" ? "Received by" : "From"}>
          <div className="flex items-center gap-2"><Avatar name={payer?.name ?? "?"} color={payer?.avatarColor} size="sm" /><div className="relative min-w-0 flex-1"><select aria-label={recordType === "expense" ? "Paid by" : recordType === "income" ? "Received by" : "Transfer from"} className="w-full appearance-none bg-transparent pr-6 text-sm font-extrabold outline-none" value={payerId} onChange={(changeEvent) => { const nextPayerId = changeEvent.target.value; setPayerId(nextPayerId); if (recordType === "transfer" && selected[0] === nextPayerId) { const nextRecipient = members.find((member) => member.id !== nextPayerId); setSelected(nextRecipient ? [nextRecipient.id] : []); } }}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-0 top-0.5 text-muted" size={17} /></div></div>
        </RecordRow>

        {recordType === "transfer" ? <div className="grid grid-cols-[108px_1fr] gap-4 border-b border-line py-4">
          <p className="pt-2 text-sm font-extrabold">To</p>
          <div className="grid gap-1">
            {members.filter((member) => member.id !== payerId).map((member) => {
              const active = selected.includes(member.id);
              return <div key={member.id} className={`flex min-h-12 items-center gap-2 rounded-xl px-1 transition ${active ? "text-ink" : "text-slate-400"}`}><button type="button" onClick={() => toggleMember(member.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><Avatar name={member.name} color={member.avatarColor} size="sm" /><span className="truncate text-sm font-extrabold">{member.name}</span></button>{active && <span className="text-xs font-bold text-muted">{formatMoney(baseAmount, baseCurrency)}</span>}<button type="button" aria-label={`${active ? "Exclude" : "Include"} ${member.name}`} onClick={() => toggleMember(member.id)} className={`grid size-6 place-items-center rounded-full border ${active ? "border-brand bg-brand text-[#103a55]" : "border-slate-300 bg-white"}`}>{active && <Check size={14} strokeWidth={3} />}</button></div>;
            })}
          </div>
        </div> : <button type="button" onClick={openSplitEditor} className="grid w-full grid-cols-[108px_1fr] items-start gap-4 border-b border-line py-4 text-left transition hover:bg-slate-50" aria-label={`Edit ${recordType === "expense" ? "split by" : "shared with"}`}>
          <span className="pt-2 text-sm font-extrabold">{recordType === "expense" ? "Split by" : "Shared with"}</span>
          <span className="grid min-w-0 gap-1">
            <span className="mb-1 flex items-center justify-end gap-2"><span className={`text-xs font-bold ${splitConfigurationError ? "text-danger" : "text-muted"}`}>{splitConfigurationError ? "Needs update" : methods.find((option) => option.id === method)?.label}</span><ChevronRight size={18} className="shrink-0 text-slate-300" /></span>
            {selectedSplitMembers.length === 0 ? <span className="py-2 text-right text-sm font-bold text-muted">Select people</span> : selectedSplitMembers.map((member) => <span key={member.id} className="flex min-h-10 items-center gap-2"><Avatar name={member.name} color={member.avatarColor} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-extrabold">{member.name}{(member.userId === snapshot.currentUser.id || member.id === snapshot.currentUser.id) && <span className="ml-1 font-semibold text-muted">(me)</span>}</span><span className="shrink-0 text-xs font-extrabold text-muted">{formatMoney(savedSplitAmounts.get(member.id) ?? 0, baseCurrency)}</span></span>)}
          </span>
        </button>}

        {error && <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
        <p className="mt-5 text-center text-xs leading-5 text-muted">Saved locally first and synced when connected.</p>
      </form>

      {dateEditorOpen && <RecordDateEditor value={date} onChange={setDate} onClose={() => setDateEditorOpen(false)} />}

      {splitEditorOpen && <SplitEditor
        members={members}
        currentUserId={snapshot.currentUser.id}
        total={baseAmount}
        currency={baseCurrency}
        method={draftMethod}
        selected={draftSelected}
        values={draftValues}
        onMethodChange={setDraftMethod}
        onSelectedChange={setDraftSelected}
        onValuesChange={setDraftValues}
        onClose={() => setSplitEditorOpen(false)}
        onSave={saveSplitEditor}
      />}
    </div>
  );
}

function RecordDateEditor({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const initialDate = parseLocalDateTime(value);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [monthYearPickerOpen, setMonthYearPickerOpen] = useState(false);
  const monthScroller = useRef<HTMLDivElement>(null);
  const yearScroller = useRef<HTMLDivElement>(null);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("en-CA", { month: "long" }).format(new Date(2020, index, 1)));
  const firstPickerYear = Math.min(1900, year - 100);
  const lastPickerYear = Math.max(2100, year + 100);
  const pickerYears = Array.from({ length: lastPickerYear - firstPickerYear + 1 }, (_, index) => firstPickerYear + index);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const timeValue = `${String(selectedDate.getHours()).padStart(2, "0")}:${String(selectedDate.getMinutes()).padStart(2, "0")}`;

  useEffect(() => {
    if (!monthYearPickerOpen) return;
    const centerSelectedOption = (scroller: HTMLDivElement | null) => {
      const selectedOption = scroller?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!scroller || !selectedOption) return;
      scroller.scrollTop = selectedOption.offsetTop - scroller.clientHeight / 2 + selectedOption.clientHeight / 2;
    };
    requestAnimationFrame(() => {
      centerSelectedOption(monthScroller.current);
      centerSelectedOption(yearScroller.current);
    });
  }, [monthYearPickerOpen, month, year]);

  function selectDay(day: number) {
    const next = new Date(selectedDate);
    next.setFullYear(year, month, day);
    setSelectedDate(next);
  }

  function changeTime(nextTime: string) {
    const [hours, minutes] = nextTime.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const next = new Date(selectedDate);
    next.setHours(hours, minutes, 0, 0);
    setSelectedDate(next);
  }

  function changeMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function selectToday() {
    const today = new Date();
    const next = new Date(selectedDate);
    next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    setSelectedDate(next);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setMonthYearPickerOpen(false);
  }

  function saveDate() {
    onChange(toLocalDateTimeInputValue(selectedDate));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#eef4f8]" role="dialog" aria-modal="true" aria-labelledby="record-date-title">
      <section className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col bg-white shadow-2xl">
        <header className="sticky top-0 z-20 grid h-[86px] grid-cols-[52px_1fr_auto] items-center gap-2 bg-white/95 px-5 backdrop-blur">
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full border border-line bg-white text-muted shadow-sm transition hover:bg-slate-50 hover:text-ink" aria-label="Close without saving"><X size={23} strokeWidth={2.4} /></button>
          <h1 id="record-date-title" className="text-xl font-extrabold tracking-[-0.03em]">Record Date</h1>
          <button type="button" onClick={saveDate} className="min-h-12 rounded-full bg-brand px-5 text-sm font-extrabold text-[#103a55] shadow-sm transition hover:bg-[#62afe5]">Save</button>
        </header>

        <div className="flex flex-1 flex-col px-5 pb-8">
          <div className="flex items-center justify-between gap-4 py-6">
            <button type="button" onClick={() => setMonthYearPickerOpen((current) => !current)} aria-expanded={monthYearPickerOpen} aria-controls="month-year-picker" className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-left text-lg font-extrabold tracking-tight transition hover:text-brand-dark">{new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(visibleMonth)}<ChevronDown size={19} className={`text-brand-dark transition ${monthYearPickerOpen ? "rotate-180" : ""}`} /></button>
            <div className="flex gap-2">
              <button type="button" onClick={selectToday} className="min-h-11 rounded-xl bg-brand-soft px-3 text-xs font-extrabold text-brand-dark transition hover:bg-brand" aria-label="Select today">Today</button>
              <button type="button" onClick={() => changeMonth(-1)} className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Previous month"><ChevronLeft size={22} /></button>
              <button type="button" onClick={() => changeMonth(1)} className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Next month"><ChevronRight size={22} /></button>
            </div>
          </div>

          {monthYearPickerOpen ? <section id="month-year-picker" aria-label="Choose month and year" className="rounded-[1.4rem] border border-line bg-slate-50 p-3 shadow-inner">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="mb-2 px-2 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">Month</p><div ref={monthScroller} role="listbox" aria-label="Month" className="h-64 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl bg-white p-2">
                {monthNames.map((monthName, monthIndex) => <button key={monthName} type="button" role="option" aria-selected={monthIndex === month} onClick={() => setVisibleMonth(new Date(year, monthIndex, 1))} className={`mb-1 flex min-h-12 w-full snap-center items-center justify-center rounded-xl px-2 text-sm font-extrabold transition ${monthIndex === month ? "bg-brand text-[#103a55] shadow-sm" : "text-muted hover:bg-brand-soft hover:text-brand-dark"}`}>{monthName}</button>)}
              </div></div>
              <div><p className="mb-2 px-2 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">Year</p><div ref={yearScroller} role="listbox" aria-label="Year" className="h-64 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl bg-white p-2">
                {pickerYears.map((pickerYear) => <button key={pickerYear} type="button" role="option" aria-selected={pickerYear === year} onClick={() => setVisibleMonth(new Date(pickerYear, month, 1))} className={`mb-1 flex min-h-12 w-full snap-center items-center justify-center rounded-xl px-2 text-sm font-extrabold transition ${pickerYear === year ? "bg-brand text-[#103a55] shadow-sm" : "text-muted hover:bg-brand-soft hover:text-brand-dark"}`}>{pickerYear}</button>)}
              </div></div>
            </div>
            <button type="button" onClick={() => setMonthYearPickerOpen(false)} className="mt-3 min-h-11 w-full rounded-xl bg-brand px-4 text-sm font-extrabold text-[#103a55]">Show calendar</button>
          </section> : <div className="grid grid-cols-7 text-center" aria-label={`${new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(visibleMonth)} calendar`}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => <span key={weekday} className="pb-3 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-muted">{weekday}</span>)}
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} aria-hidden="true" className="aspect-square" />;
              const selected = day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
              const today = isSameCalendarDay(new Date(year, month, day), new Date());
              return <button key={day} type="button" onClick={() => selectDay(day)} aria-label={`${new Intl.DateTimeFormat("en-CA", { month: "long" }).format(visibleMonth)} ${day}, ${year}`} aria-pressed={selected} className="grid aspect-square place-items-center p-1"><span className={`grid size-10 max-h-full max-w-full place-items-center rounded-full text-sm font-extrabold transition ${selected ? "bg-brand text-[#103a55] shadow-sm" : today ? "border border-brand text-brand-dark" : "hover:bg-slate-50"}`}>{day}</span></button>;
            })}
          </div>}

          <div className="mt-auto border-t border-line pt-6">
            <label className="flex min-h-14 items-center justify-between gap-4"><span className="text-base font-extrabold">Time</span><input type="time" aria-label="Record time" value={timeValue} onChange={(event) => changeTime(event.target.value)} className="min-h-11 rounded-xl bg-slate-100 px-4 text-right text-base font-extrabold text-ink outline-none focus:ring-2 focus:ring-brand" /></label>
          </div>
        </div>
      </section>
    </div>
  );
}

function SplitEditor({ members, currentUserId, total, currency, method, selected, values, onMethodChange, onSelectedChange, onValuesChange, onClose, onSave }: {
  members: Array<{ id: string; userId: string; name: string; avatarColor?: string }>;
  currentUserId: string;
  total: number;
  currency: CurrencyCode;
  method: SplitMethod;
  selected: string[];
  values: Record<string, string>;
  onMethodChange(method: SplitMethod): void;
  onSelectedChange(memberIds: string[]): void;
  onValuesChange(values: Record<string, string>): void;
  onClose(): void;
  onSave(): void;
}) {
  const validationError = validateSplitConfiguration(total, currency, method, selected, values);
  const enteredTotal = selected.reduce((sum, memberId) => sum + (Number(values[memberId]) || 0), 0);
  const totalShares = selected.reduce((sum, memberId) => sum + (Number(values[memberId]) || 0), 0);
  const allocationProgress = splitAllocationProgress(method, total, currency, enteredTotal, selected.length);
  let allocatedPreview: ReturnType<typeof allocateSplits> = [];
  if (total > 0 && selected.length > 0) {
    try {
      allocatedPreview = allocateSplits("split-preview", total, currency, method, selected.map((memberId) => ({ memberId, value: method === "equal" ? undefined : Number(values[memberId]) || 0 })));
    } catch {
      allocatedPreview = [];
    }
  }

  function toggle(memberId: string) {
    onSelectedChange(selected.includes(memberId) ? selected.filter((id) => id !== memberId) : [...selected, memberId]);
  }

  function previewAmount(memberId: string) {
    if (!selected.includes(memberId)) return 0;
    const allocated = allocatedPreview.find((split) => split.memberId === memberId);
    if (allocated) return allocated.owedAmount;
    if (method === "equal") return selected.length ? roundMoney(total / selected.length, currency) : 0;
    const value = Number(values[memberId]) || 0;
    if (method === "exact") return value;
    if (method === "percentage") return roundMoney(total * value / 100, currency);
    return totalShares > 0 ? roundMoney(total * value / totalShares, currency) : 0;
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#f4f8fb]" role="dialog" aria-modal="true" aria-labelledby="split-editor-title">
      <section className="mx-auto min-h-dvh w-full max-w-[680px] bg-white shadow-2xl">
        <header className="sticky top-0 z-20 grid h-[76px] grid-cols-[64px_1fr_80px] items-center border-b border-line bg-white/95 px-4 backdrop-blur">
          <button type="button" onClick={onClose} className="grid size-12 place-items-center rounded-full border border-line bg-white text-muted shadow-sm" aria-label="Close split editor"><X size={25} strokeWidth={2.4} /></button>
          <h1 id="split-editor-title" className="text-center text-xl font-extrabold tracking-[-0.03em]">Split by</h1>
          <button type="button" onClick={onSave} disabled={Boolean(validationError)} className="min-h-11 rounded-full bg-brand px-4 text-sm font-extrabold text-[#103a55] transition enabled:hover:bg-[#62afe5] disabled:bg-slate-100 disabled:text-slate-400">Save</button>
        </header>

        <div className="px-5 pb-10">
          <div className="border-b border-line py-6">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-muted">Record total</p><p className="mt-1 text-sm font-bold text-muted">Choose how everyone shares it.</p></div>
              <p className="text-2xl font-extrabold tracking-tight">{formatMoney(total, currency)}</p>
            </div>
          </div>

          <section className="border-b border-line py-5" aria-labelledby="split-method-heading">
            <h2 id="split-method-heading" className="mb-3 text-sm font-extrabold">Split method</h2>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((option) => <button type="button" key={option.id} onClick={() => onMethodChange(option.id)} aria-pressed={method === option.id} className={`min-h-12 rounded-xl px-1 text-sm font-extrabold transition ${method === option.id ? "bg-brand text-[#103a55] shadow-sm" : "bg-slate-50 text-muted"}`}>{option.label}</button>)}
            </div>
          </section>

          <section className="py-4" aria-labelledby="split-people-heading">
            <div className="mb-2 flex items-center justify-between gap-3"><h2 id="split-people-heading" className="text-sm font-extrabold">People</h2><span className="text-xs font-bold text-muted">{selected.length} selected</span></div>
            <div className="divide-y divide-line">
              {members.map((member) => {
                const active = selected.includes(member.id);
                const isMe = member.userId === currentUserId || member.id === currentUserId;
                return <div key={member.id} className={`flex min-h-16 items-center gap-3 py-2 ${active ? "text-ink" : "text-slate-400"}`}>
                  <button type="button" onClick={() => toggle(member.id)} aria-label={`${active ? "Exclude" : "Include"} ${member.name}`} aria-pressed={active} className={`grid size-8 shrink-0 place-items-center rounded-full border transition ${active ? "border-brand bg-brand text-[#103a55]" : "border-slate-300 bg-white"}`}>{active && <Check size={17} strokeWidth={2.7} />}</button>
                  <button type="button" onClick={() => toggle(member.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Avatar name={member.name} color={member.avatarColor} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-extrabold">{member.name}{isMe && <span className="ml-1 font-semibold text-muted">(me)</span>}</span></button>
                  {active && method !== "equal" ? <div className="grid w-28 justify-items-end gap-0.5">
                    <div className="relative w-full"><input aria-label={`${member.name} ${method} split`} inputMode="decimal" type="number" min="0" step={method === "exact" && currency === "JPY" ? "1" : "0.01"} value={values[member.id] ?? ""} onChange={(event) => onValuesChange({ ...values, [member.id]: event.target.value })} placeholder="0" className="h-10 w-full rounded-lg bg-slate-50 px-2 pr-9 text-right text-sm font-extrabold outline-none focus:ring-2 focus:ring-brand" /><span className="pointer-events-none absolute right-2 top-2.5 text-[0.62rem] font-bold text-muted">{method === "percentage" ? "%" : method === "shares" ? "×" : currency}</span></div>
                    {method !== "exact" && <span className="text-[0.65rem] font-bold text-muted">{formatMoney(previewAmount(member.id), currency)}</span>}
                  </div> : active ? <span className="shrink-0 text-xs font-extrabold text-muted">{formatMoney(previewAmount(member.id), currency)}</span> : <span className="shrink-0 text-xs font-bold text-muted">Not included</span>}
                </div>;
              })}
            </div>
          </section>

          {allocationProgress.visible && <div aria-live="polite" className={`mb-3 flex min-h-11 items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-extrabold ${allocationProgress.tone === "danger" ? "bg-danger-soft text-danger" : allocationProgress.tone === "success" ? "bg-[#e9f8ef] text-success" : "bg-brand-soft text-brand-dark"}`}>
            <span>{allocationProgress.label}</span>
            <span>{allocationProgress.value}</span>
          </div>}
          {validationError && <p role="alert" className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">{validationError}</p>}
        </div>
      </section>
    </div>
  );
}

function splitAllocationProgress(method: SplitMethod, total: number, currency: CurrencyCode, enteredTotal: number, selectedCount: number) {
  if (method === "percentage") {
    const remaining = Math.round((100 - enteredTotal) * 100) / 100;
    if (remaining < 0) return { label: "Over by", value: `${formatSplitNumber(Math.abs(remaining))}%`, tone: "danger" as const, visible: true };
    return { label: "Remaining", value: `${formatSplitNumber(remaining)}%`, tone: "progress" as const, visible: remaining > 0 };
  }

  if (method === "shares") {
    if (enteredTotal > 0) return { label: "Total shares", value: formatSplitNumber(enteredTotal), tone: "success" as const, visible: true };
    return { label: "Remaining", value: formatMoney(total, currency), tone: "progress" as const, visible: total > 0 };
  }

  const allocated = method === "equal" && selectedCount > 0 ? total : enteredTotal;
  const remaining = roundMoney(total - allocated, currency);
  if (remaining < 0) return { label: "Over by", value: formatMoney(Math.abs(remaining), currency), tone: "danger" as const, visible: true };
  return { label: "Remaining", value: formatMoney(remaining, currency), tone: "progress" as const, visible: remaining > 0 };
}

function formatSplitNumber(value: number) {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
}

function RecordRow({ label, children, alignStart = false }: { label: string; children: React.ReactNode; alignStart?: boolean }) {
  return <div className={`grid grid-cols-[108px_1fr] gap-4 border-b border-line py-4 ${alignStart ? "items-start" : "items-center"}`}><span className={`text-sm font-extrabold ${alignStart ? "pt-1" : ""}`}>{label}</span><div className="min-w-0">{children}</div></div>;
}

function formatRecordDate(value: string) {
  const recordDate = new Date(value);
  if (Number.isNaN(recordDate.getTime())) return "Select date";
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(recordDate);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(recordDate).toLowerCase();
  return `${day} at ${time}`;
}

function toLocalDateTimeInputValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function parseLocalDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isSameCalendarDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatExchangeRate(rate: number) {
  return rate.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function formatRateDate(value: string) {
  if (!value) return "latest available date";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function validateSplitConfiguration(total: number, currency: CurrencyCode, method: SplitMethod, selected: string[], values: Record<string, string>) {
  if (selected.length === 0) return "Select at least one person.";
  if (total <= 0) return method === "equal" ? "" : "Enter the record amount before editing a custom split.";
  try {
    allocateSplits("split-preview", total, currency, method, selected.map((memberId) => ({ memberId, value: method === "equal" ? undefined : Number(values[memberId]) || 0 })));
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Check the split values.";
  }
}

function previewSplitAmounts(total: number, currency: CurrencyCode, method: SplitMethod, selected: string[], values: Record<string, string>) {
  const amounts = new Map<string, number>();
  if (selected.length === 0 || total <= 0) {
    selected.forEach((memberId) => amounts.set(memberId, 0));
    return amounts;
  }
  try {
    const splits = allocateSplits("split-preview", total, currency, method, selected.map((memberId) => ({ memberId, value: method === "equal" ? undefined : Number(values[memberId]) || 0 })));
    splits.forEach((split) => amounts.set(split.memberId, split.owedAmount));
    return amounts;
  } catch {
    const shareTotal = selected.reduce((sum, memberId) => sum + (Number(values[memberId]) || 0), 0);
    selected.forEach((memberId) => {
      const value = Number(values[memberId]) || 0;
      const preview = method === "exact"
        ? value
        : method === "percentage"
          ? total * value / 100
          : method === "shares" && shareTotal > 0
            ? total * value / shareTotal
            : total / selected.length;
      amounts.set(memberId, roundMoney(preview, currency));
    });
    return amounts;
  }
}

function defaultSplitMemberIds(members: Array<{ id: string; userId: string }>, currentUserId: string) {
  const myself = members.find((member) => member.userId === currentUserId || member.id === currentUserId);
  return myself
    ? [myself.id, ...members.filter((member) => member.id !== myself.id).map((member) => member.id)]
    : members.map((member) => member.id);
}
