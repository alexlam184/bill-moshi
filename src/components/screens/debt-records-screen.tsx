"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarDays, Camera, Check, CheckCircle2, ChevronDown, HandCoins, Image as ImageIcon, Pencil, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Card, EmptyState, PageTitle } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/calculations";
import { calculateDebtShareAmounts, equalDebtShareValues, MAX_BULK_DEBT_PEOPLE, parseDebtPersonNames, summarizeUnpaidDebtRecords, type DebtCurrencySummary, type DebtShareMethod } from "@/lib/domain/debt-records";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type DebtDirection, type DebtStatus } from "@/lib/domain/types";
import { useQueryState } from "@/lib/hooks/use-query-state";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";

type StatusFilter = "all" | DebtStatus;

export function DebtRecordsScreen({ composerMode = false, editingDebtRecordId, view = "overview" }: { composerMode?: boolean; editingDebtRecordId?: string; view?: "overview" | "records" }) {
  const router = useRouter();
  const { snapshot, hydrated, addDebtRecords, updateDebtRecord, updateDebtRecordStatus } = useBillMoshi();
  const editingDebtRecord = snapshot.debtRecords.find((record) => record.id === editingDebtRecordId);
  const editMode = Boolean(editingDebtRecordId);
  const initializedEdit = useRef(false);
  const [direction, setDirection] = useState<DebtDirection>("lent");
  const [personNamesInput, setPersonNamesInput] = useState("");
  const [recordName, setRecordName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("CAD");
  const [date, setDate] = useState(todayInputValue);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useQueryState<StatusFilter>("status", view === "records" ? "all" : "unpaid", ["all", "unpaid", "paid"]);
  const [error, setError] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const [shareMethod, setShareMethod] = useState<DebtShareMethod>("equal");
  const [shareValues, setShareValues] = useState<Record<DebtShareMethod, Record<string, string>>>({ equal: {}, exact: {}, percentage: {}, shares: {} });
  const [excludedSplitKeys, setExcludedSplitKeys] = useState<string[]>([]);
  useUnsavedChanges(composerMode && formDirty && !saving);

  useEffect(() => {
    if (!editingDebtRecord || initializedEdit.current) return;
    initializedEdit.current = true;
    queueMicrotask(() => {
      setDirection(editingDebtRecord.direction);
      setPersonNamesInput(editingDebtRecord.personName);
      setRecordName(editingDebtRecord.name);
      setAmount(String(editingDebtRecord.amount));
      setCurrency(editingDebtRecord.currency);
      setDate(editingDebtRecord.date);
      setDueDate(editingDebtRecord.dueDate ?? "");
      setNote(editingDebtRecord.note ?? "");
      setShareMethod("equal");
      setShareValues({ equal: {}, exact: {}, percentage: {}, shares: {} });
    });
  }, [editingDebtRecord]);

  const summaries = useMemo(() => summarizeUnpaidDebtRecords(snapshot.debtRecords), [snapshot.debtRecords]);
  const personNames = useMemo(() => parseDebtPersonNames(personNamesInput), [personNamesInput]);
  const splitParticipants = editMode
    ? personNames.map((name) => ({ key: name, name, isMe: false }))
    : [{ key: "__current_user__", name: snapshot.currentUser.name, isMe: true }, ...personNames.map((name) => ({ key: name, name, isMe: false }))];
  const activeSplitParticipants = splitParticipants.filter((participant) => !excludedSplitKeys.includes(participant.key));
  const activeOtherParticipants = activeSplitParticipants.filter((participant) => !participant.isMe);
  const numericAmount = Number(amount);
  const equalShareDefaults = equalDebtShareValues(numericAmount, activeSplitParticipants.length, currency, shareMethod);
  const activeShareInputs = activeSplitParticipants.map((participant, index) => shareValues[shareMethod][participant.key] ?? formatShareInput(equalShareDefaults[index]));
  const activeShareNumbers = activeShareInputs.map(Number);
  let shareError = "";
  let calculatedShares: number[] = [];
  if (personNames.length > 0 && numericAmount > 0) {
    if (activeSplitParticipants.length === 0) {
      shareError = "Select at least one person to split by.";
    } else {
      try {
        calculatedShares = calculateDebtShareAmounts(numericAmount, currency, shareMethod, activeShareNumbers);
        if (!editMode && activeOtherParticipants.length === 0) shareError = "Select at least one other person to create a debt record.";
      } catch (calculationError) {
        shareError = calculationError instanceof Error ? calculationError.message : "Check each person's share.";
      }
    }
  }
  const records = useMemo(() => snapshot.debtRecords
    .filter((record) => filter === "all" || record.status === filter)
    .toSorted((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [filter, snapshot.debtRecords]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (personNames.length === 0) throw new Error("Enter at least one person's name.");
      if (editMode && personNames.length !== 1) throw new Error("An existing debt record must have one person.");
      if (personNames.length > MAX_BULK_DEBT_PEOPLE) throw new Error(`You can add up to ${MAX_BULK_DEBT_PEOPLE} people at once.`);
      const debtAmounts = calculateDebtShareAmounts(numericAmount, currency, shareMethod, activeShareNumbers);

      if (editingDebtRecordId) {
        await updateDebtRecord(editingDebtRecordId, {
          direction,
          personName: personNames[0],
          name: recordName,
          amount: debtAmounts[0],
          currency,
          date,
          dueDate: dueDate || undefined,
          note,
        }, photos);
      } else {
        const debtInputs = activeSplitParticipants.flatMap((participant, index) => participant.isMe ? [] : [{
            direction,
            personName: participant.name,
            name: recordName,
            amount: debtAmounts[index],
            currency,
            date,
            dueDate: dueDate || undefined,
            note,
          }]);
        await addDebtRecords(debtInputs, photos);
      }
      setPersonNamesInput("");
      setRecordName("");
      setAmount("");
      setDueDate("");
      setNote("");
      setPhotos([]);
      setDate(todayInputValue());
      setShareValues({ equal: {}, exact: {}, percentage: {}, shares: {} });
      setExcludedSplitKeys([]);
      setFormDirty(false);
      router.push("/debts");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save the debt record.");
      requestAnimationFrame(() => document.getElementById("debt-form-error")?.focus());
    } finally {
      setSaving(false);
    }
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const existingCount = editingDebtRecord?.localPhotoIds?.length ?? 0;
    const available = Math.max(0, 5 - existingCount - photos.length);
    const selected = Array.from(files);
    if (selected.length > available) setError(`Attach up to 5 photos. You can add ${available} more.`);
    setPhotos((current) => [...current, ...selected.slice(0, available)]);
  }

  function updateShareValue(participantKey: string, value: string) {
    setShareValues((current) => ({
      ...current,
      [shareMethod]: { ...current[shareMethod], [participantKey]: value },
    }));
  }

  function toggleSplitParticipant(participantKey: string) {
    setFormDirty(true);
    setExcludedSplitKeys((current) => current.includes(participantKey)
      ? current.filter((key) => key !== participantKey)
      : [...current, participantKey]);
  }

  function changeDirection(nextDirection: DebtDirection) {
    setFormDirty(true);
    setDirection(nextDirection);
    if (editMode) return;
    setExcludedSplitKeys((current) => nextDirection === "borrowed"
      ? current.includes("__current_user__") ? current : [...current, "__current_user__"]
      : current.filter((key) => key !== "__current_user__"));
  }

  if (composerMode && editMode && hydrated && !editingDebtRecord) return <Card className="mx-auto max-w-md p-8 text-center"><h1 className="font-extrabold">Debt record not found</h1><p className="mt-2 text-sm text-muted">It may have been removed from this device.</p><Link href="/debts" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-extrabold text-brand-ink">Back to debt records</Link></Card>;

  if (composerMode) return (
    <div className="mx-auto min-h-dvh w-full max-w-[680px] overflow-hidden bg-white md:min-h-0 md:rounded-[1.75rem] md:border md:border-line modal-shadow">
      <header className="safe-top-record-header sticky top-0 z-20 grid grid-cols-[64px_1fr_80px] items-center bg-white/95 px-4 backdrop-blur">
        <Link href="/debts" aria-label="Close new debt record" className="grid size-12 place-items-center rounded-full border border-line bg-white text-muted shadow-sm transition hover:bg-slate-50 hover:text-ink"><X size={25} strokeWidth={2.4} /></Link>
        <h1 className="text-center text-xl font-extrabold tracking-[-0.03em]">{editMode ? "Edit Debt Record" : "New Debt Record"}</h1>
        <button form="debt-record-form" type="submit" disabled={saving} className="min-h-11 rounded-full bg-brand px-4 text-sm font-extrabold text-brand-ink transition enabled:hover:bg-brand-hover disabled:bg-slate-100 disabled:text-slate-400">{saving ? "Saving…" : "Done"}</button>
      </header>

      <div className="grid grid-cols-2 border-b border-line px-5" role="tablist" aria-label="Debt direction">
        <button type="button" role="tab" aria-selected={direction === "lent"} onClick={() => changeDirection("lent")} className={`relative min-h-14 text-sm transition ${direction === "lent" ? "font-extrabold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-t-full after:bg-brand" : "font-bold text-muted"}`}>They owe me</button>
        <button type="button" role="tab" aria-selected={direction === "borrowed"} onClick={() => changeDirection("borrowed")} className={`relative min-h-14 text-sm transition ${direction === "borrowed" ? "font-extrabold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-t-full after:bg-brand" : "font-bold text-muted"}`}>I owe them</button>
      </div>

      <form id="debt-record-form" className="px-5 pb-12" onSubmit={submit} onChange={() => setFormDirty(true)} noValidate>
        <section className="grid grid-cols-[46%_54%] items-center border-b border-line py-8">
          <label className="relative flex w-fit items-center gap-2">
            <span className="sr-only">Currency</span>
            <select aria-label="Currency" name="currency" autoComplete="off" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="record-currency-display min-h-11 max-w-full appearance-none bg-transparent pr-8 font-extrabold outline-none">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select>
            <ChevronDown className="pointer-events-none absolute right-0 text-muted" size={20} />
          </label>
          <input aria-label="Total debt amount" name="amount" autoComplete="off" type="number" min="0" step={currency === "JPY" ? "1" : "0.01"} inputMode="decimal" className="record-amount-display min-w-0 bg-transparent text-right font-extrabold outline-none placeholder:text-slate-300" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </section>

        <DebtRecordRow label="Date"><input aria-label="Debt date" name="debt-date" autoComplete="off" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 w-full bg-transparent text-right text-sm font-bold text-muted outline-none" required /></DebtRecordRow>
        <DebtRecordRow label="Due date"><input aria-label="Debt due date" name="due-date" autoComplete="off" type="date" value={dueDate} min={date} onChange={(event) => setDueDate(event.target.value)} className="min-h-11 w-full bg-transparent text-right text-sm font-bold text-muted outline-none" /></DebtRecordRow>
        <DebtRecordRow label="Name"><input aria-label="Debt name" name="debt-name" autoComplete="off" value={recordName} onChange={(event) => setRecordName(event.target.value)} className="min-h-11 w-full bg-transparent text-sm font-bold outline-none placeholder:text-placeholder" placeholder="e.g. Restaurant bill…" required /></DebtRecordRow>
        <DebtRecordRow label="Memo" alignStart>
          <div className="flex min-w-0 items-start gap-2">
            <textarea aria-label="Debt memo" name="debt-memo" autoComplete="off" value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="min-h-16 min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400" placeholder="Add a note (optional)…" />
            <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Attach debt photos"><Camera size={19} /><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} /></label>
          </div>
          {((editingDebtRecord?.photoNames?.length ?? 0) > 0 || photos.length > 0) && <div className="mt-2 grid gap-1.5">
            {(editingDebtRecord?.photoNames ?? []).map((photoName, index) => { const fileId = Object.values(editingDebtRecord?.photoFileIds ?? {})[index]; return fileId ? <a key={`${photoName}-${index}`} href={`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 items-center gap-1.5 text-xs font-bold text-brand-dark"><ImageIcon size={13} className="shrink-0" /><span className="truncate">{photoName}</span><span className="ml-auto shrink-0 text-[0.62rem] underline">Open</span></a> : <span key={`${photoName}-${index}`} className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-brand-dark"><ImageIcon size={13} className="shrink-0" /><span className="truncate">{photoName}</span><span className="ml-auto shrink-0 text-[0.62rem] text-muted">Saved</span></span>; })}
            {photos.map((photo, index) => <span key={`${photo.name}-${photo.lastModified}-${index}`} className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-brand-dark"><ImageIcon size={13} className="shrink-0" /><span className="truncate">{photo.name}</span><button type="button" onClick={() => { setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index)); setFormDirty(true); }} className="ml-auto grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-danger" aria-label={`Remove ${photo.name}`}><X size={14} /></button></span>)}
          </div>}
          <p className="mt-2 text-[0.68rem] leading-5 text-muted">Up to 5 JPEG, PNG, or WebP photos · 15 MB each</p>
        </DebtRecordRow>

        <DebtRecordRow label={direction === "lent" ? "Who owes you?" : "Who do you owe?"} alignStart>
          <textarea
            aria-label={direction === "lent" ? "Who owes you?" : "Who do you owe?"}
            name="people"
            autoComplete="off"
            value={personNamesInput}
            onChange={(event) => setPersonNamesInput(event.target.value)}
            className="min-h-28 w-full resize-y bg-transparent text-sm font-bold leading-6 outline-none placeholder:text-slate-400"
            placeholder={"e.g. Mary\nPeter\nTom\nPaul"}
            required
          />
          <p className="mt-2 text-xs leading-5 text-muted">{editMode ? "Edit the person attached to this debt record." : "Use new lines or commas · English and Chinese supported"}</p>
          {personNames.length > 0 && <div className={`mt-3 rounded-xl border p-3 ${personNames.length > MAX_BULK_DEBT_PEOPLE ? "border-danger/30 bg-danger-soft" : "border-brand/25 bg-brand-soft/40"}`}>
            <div className="flex items-center justify-between gap-3 text-xs font-extrabold">
              <span className={personNames.length > MAX_BULK_DEBT_PEOPLE ? "text-danger" : "text-brand-dark"}>{personNames.length} {personNames.length === 1 ? "person" : "people"} found</span>
              <span className="text-muted">{editMode ? "One person" : `Maximum ${MAX_BULK_DEBT_PEOPLE}`}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {personNames.slice(0, 10).map((name) => <span key={name} className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink shadow-sm">{name}</span>)}
              {personNames.length > 10 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-muted shadow-sm">+{personNames.length - 10} more</span>}
            </div>
          </div>}
        </DebtRecordRow>

        {!editMode && <DebtRecordRow label="Split method">
          <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-4">
            {([
              ["equal", "Equal"],
              ["exact", "Exact"],
              ["percentage", "%"],
              ["shares", "Shares"],
            ] as const).map(([method, label]) => <button key={method} type="button" onClick={() => { setShareMethod(method); setFormDirty(true); }} className={`min-h-11 rounded-xl px-1 text-xs font-extrabold transition hover:text-ink ${shareMethod === method ? "bg-brand text-brand-ink shadow-sm" : "bg-slate-50 text-muted hover:bg-brand-soft"}`}>{label}</button>)}
          </div>
        </DebtRecordRow>}

        {!editMode && <div className="grid grid-cols-[108px_1fr] gap-4 border-b border-line py-4">
          <div className="pt-2"><p className="text-sm font-extrabold">Split by</p>{personNames.length > 0 && shareMethod !== "equal" && <button type="button" onClick={() => { setShareValues((current) => ({ ...current, [shareMethod]: {} })); setFormDirty(true); }} className="mt-2 text-[0.68rem] font-extrabold text-brand-dark hover:underline">Reset</button>}</div>
          <div className="grid gap-1">
            {splitParticipants.map((participant) => {
              const active = !excludedSplitKeys.includes(participant.key);
              const activeIndex = activeSplitParticipants.findIndex((item) => item.key === participant.key);
              const calculatedShare = activeIndex >= 0 ? calculatedShares[activeIndex] : undefined;
              return <div key={participant.key} className={`flex min-h-12 items-center gap-2 rounded-xl transition ${active ? "text-ink" : "text-slate-400"}`}>
              <Avatar name={participant.name} color={participant.isMe ? "var(--color-avatar-brand)" : "var(--color-avatar-soft)"} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{participant.name}{participant.isMe && <span className="ml-1 font-semibold text-muted">(me)</span>}</span>
              {active && (shareMethod === "equal" ? <span className="shrink-0 text-xs font-extrabold text-muted">{calculatedShare === undefined ? "—" : formatMoney(calculatedShare, currency)}</span> : <div className="relative w-28">
                <input
                  aria-label={`${participant.isMe ? "My" : participant.name} ${shareMethod}`}
                  name={`share-${participant.key}`}
                  autoComplete="off"
                  type="number"
                  min="0"
                  max={shareMethod === "percentage" ? "100" : undefined}
                  step={shareMethod === "exact" && currency === "JPY" ? "1" : "0.01"}
                  inputMode="decimal"
                  className="h-11 w-full rounded-lg bg-slate-50 px-2 pr-9 text-right text-xs font-extrabold outline-none focus:ring-2 focus:ring-brand"
                  value={activeShareInputs[activeIndex]}
                  onChange={(event) => updateShareValue(participant.key, event.target.value)}
                />
                <span className="pointer-events-none absolute right-2 top-3 text-[0.62rem] font-bold text-muted">{shareMethod === "percentage" ? "%" : shareMethod === "shares" ? "×" : currency}</span>
              </div>)}
              {!active && <span className="shrink-0 text-xs font-bold text-muted">Excluded</span>}
              <button type="button" onClick={() => toggleSplitParticipant(participant.key)} aria-label={`${active ? "Exclude" : "Include"} ${participant.isMe ? "me" : participant.name}`} aria-pressed={active} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${active ? "border-brand bg-brand text-brand-ink" : "border-slate-300 bg-white"}`}>{active && <Check size={17} strokeWidth={2.7} />}</button>
            </div>})}
            {personNames.length === 0 && <p className="py-3 text-sm leading-6 text-muted">Add names above to edit each person&apos;s share.</p>}
          </div>
        </div>}

        {personNames.length > 0 && numericAmount > 0 && <div role={shareError ? "alert" : undefined} aria-live="polite" className={`mt-5 rounded-xl px-4 py-3 text-sm ${shareError ? "bg-danger-soft font-semibold text-danger" : "bg-brand-soft font-bold text-brand-dark"}`}>{shareError || (editMode ? `Updated record · ${formatMoney(calculatedShares[0] ?? 0, currency)}` : `Your share ${formatMoney(activeSplitParticipants.find((participant) => participant.isMe) ? calculatedShares[activeSplitParticipants.findIndex((participant) => participant.isMe)] ?? 0 : 0, currency)} · ${direction === "borrowed" ? "Total owed" : "To collect"} ${formatMoney(calculatedShares.reduce((sum, value, index) => sum + (activeSplitParticipants[index]?.isMe ? 0 : value), 0), currency)}`)}</div>}
        {error && <p id="debt-form-error" role="alert" aria-live="assertive" tabIndex={-1} className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger outline-none">{error}</p>}
        <p className="mt-5 text-center text-xs leading-5 text-muted">{editMode ? "Changes keep the current paid or unpaid status and sync when connected." : "Each person is saved as a separate debt record and synced when connected."}</p>
      </form>
    </div>
  );

  return (
    <div className="grid gap-6">
      <PageTitle
        eyebrow="Separate personal ledger"
        title={view === "records" ? "Payment status" : "Debt records"}
        subtitle={view === "records" ? "View every paid and unpaid debt record." : "After you cover a shared bill, add each person's share and mark it paid when they reimburse you."}
        action={<Link href="/debts/new" className="grid size-11 place-items-center rounded-xl bg-brand text-brand-ink" aria-label="Add debt record"><Plus size={20} /></Link>}
      />

      {view === "overview" && <div className="flex items-start gap-3 rounded-xl border border-brand/30 bg-brand-soft/55 p-4 text-sm text-brand-dark">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white"><HandCoins size={18} /></span>
        <div><p className="font-extrabold">Reimbursement tracker</p><p className="mt-1 leading-5 text-muted">Debt records track paid and unpaid amounts independently. They do not change LedgerRecord records or balances.</p></div>
      </div>}

      {view === "overview" && <section aria-label="Unpaid debt totals" className="grid grid-cols-2 gap-3">
        <DebtSummaryCard direction="borrowed" summaries={summaries} />
        <DebtSummaryCard direction="lent" summaries={summaries} />
      </section>}

      {view === "records" && <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold">Payment status</h2><p className="mt-1 text-xs text-muted">Check who has paid you and who is still unpaid.</p></div><span className="text-xs font-bold text-muted">{records.length} record{records.length === 1 ? "" : "s"}</span></div>
        <div className="mb-3 grid grid-cols-3 rounded-xl bg-slate-100 p-1" role="group" aria-label="Debt record filter">
          {(["all", "unpaid", "paid"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-lg text-xs font-extrabold capitalize transition ${filter === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{value}</button>)}
        </div>
        <Card className="divide-y divide-line overflow-hidden">
          {records.length === 0 ? <EmptyState icon={<HandCoins size={24} />} title={filter === "unpaid" ? "No unpaid debts" : "No debt records"} body={filter === "all" ? "Add each person's share after you cover a bill." : `No ${filter} records match this filter.`} action={<Link href="/debts/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-brand-ink">Add debt record</Link>} /> : records.map((record) => {
            const borrowed = record.direction === "borrowed";
            const relation = borrowed ? `You owe ${record.personName}` : `${record.personName} owes you`;
            return <article key={record.id} className={`virtual-list-item flex items-start gap-3 p-4 ${record.status === "paid" ? "bg-slate-50/70" : ""}`}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${borrowed ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>{borrowed ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{record.name || relation}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">{record.name && <span>{relation} ·</span>}<CalendarDays size={13} /> {formatDebtDate(record.date)}{record.dueDate ? ` · Due ${formatDebtDate(record.dueDate)}` : ""}</p></div><p className={`shrink-0 text-sm font-extrabold ${borrowed ? "text-danger" : "text-success"}`}>{formatMoney(record.amount, record.currency)}</p></div>
                {record.note && <p className="mt-2 text-sm leading-5 text-muted">{record.note}</p>}
                {(record.photoNames?.length ?? 0) > 0 && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-brand-dark"><ImageIcon size={14} /><span>{record.photoNames!.length} attached {record.photoNames!.length === 1 ? "photo" : "photos"}</span>{Object.values(record.photoFileIds ?? {}).map((fileId, index) => <a key={fileId} href={`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-2 underline">Open {record.photoNames?.[index] ?? `photo ${index + 1}`}</a>)}</div>}
                <div className="mt-3 flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold ${record.status === "unpaid" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>{record.status === "unpaid" ? "Unpaid" : "Paid"}</span><div className="flex items-center gap-1"><Link href={`/debts/${record.id}/edit`} aria-label={`Edit debt record for ${record.personName}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold text-muted hover:bg-slate-100 hover:text-ink"><Pencil size={14} />Edit</Link><button type="button" onClick={() => updateDebtRecordStatus(record.id, record.status === "unpaid" ? "paid" : "unpaid")} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold text-brand-dark hover:bg-brand-soft">{record.status === "unpaid" ? <CheckCircle2 size={15} /> : <RotateCcw size={14} />}{record.status === "unpaid" ? "Mark paid" : "Mark unpaid"}</button></div></div>
              </div>
            </article>;
          })}
        </Card>
      </section>}
    </div>
  );
}

function DebtSummaryCard({ direction, summaries }: { direction: DebtDirection; summaries: DebtCurrencySummary[] }) {
  const borrowed = direction === "borrowed";
  const amounts = summaries.flatMap((summary) => summary[direction] > 0 ? [{ currency: summary.currency, amount: summary[direction] }] : []);
  return <Card className="min-w-0 p-4"><span className={`grid size-9 place-items-center rounded-xl ${borrowed ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>{borrowed ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><p className="mt-4 text-xs font-bold text-muted">{borrowed ? "You owe" : "To collect"}</p>{amounts.length === 0 ? <p className="mt-1 text-sm font-extrabold text-ink">None unpaid</p> : <div className="mt-1 grid gap-0.5">{amounts.map(({ currency, amount }) => <p key={currency} className={`truncate text-base font-extrabold sm:text-xl ${borrowed ? "text-danger" : "text-success"}`}>{formatMoney(amount, currency)}</p>)}</div>}</Card>;
}

function DebtRecordRow({ label, children, alignStart = false }: { label: string; children: React.ReactNode; alignStart?: boolean }) {
  return <div className={`grid grid-cols-[108px_1fr] gap-4 border-b border-line py-4 ${alignStart ? "items-start" : "items-center"}`}><span className={`text-sm font-extrabold ${alignStart ? "pt-1" : ""}`}>{label}</span><div className="min-w-0">{children}</div></div>;
}

function formatShareInput(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "";
  return String(value);
}

function todayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatDebtDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
