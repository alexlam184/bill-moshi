"use client";

import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  LogOut,
  NotebookPen,
  Plus,
  ReceiptText,
  Save,
  Settings,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import {
  formatMoney,
  groupNetBalancesByUser,
  groupSpendingByDay,
  roundMoney,
  simplifyBalances,
  totalEventSpending,
  type Debt,
} from "@/lib/domain/calculations";
import type { CurrencyCode, GroupMember } from "@/lib/domain/types";
import { Avatar, Button, Card, EmptyState, PageTitle } from "@/components/ui/primitives";

export function GroupDashboardScreen({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { snapshot, hydrated, addExpense, updateGroupNotes, leaveGroup, deleteGroup } = useBillMoshi();
  const group = snapshot.groups.find((item) => item.id === groupId);
  const [eventsOpen, setEventsOpen] = useState(true);
  const [spendingMode, setSpendingMode] = useState<"group" | "mine">("group");
  const [currency, setCurrency] = useState<CurrencyCode>(group?.currency ?? snapshot.currentUser.defaultCurrency);
  const [selectedDebt, setSelectedDebt] = useState<{ debt: Debt; from: GroupMember; to: GroupMember }>();
  const [debtModalStep, setDebtModalStep] = useState<"review" | "confirm" | "success">("review");
  const [settlingDebt, setSettlingDebt] = useState(false);
  const [settlementError, setSettlementError] = useState("");
  const [settlementRecordId, setSettlementRecordId] = useState<string>();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  if (!group && !hydrated) return <div className="min-h-48 animate-pulse rounded-[1.35rem] bg-slate-50" />;
  if (!group) notFound();
  const currentGroup = group;

  const events = snapshot.events.filter((event) => event.groupId === groupId);
  const expenses = snapshot.expenses.filter((expense) => expense.groupId === groupId);
  const dailyExpenses = expenses
    .filter((expense) => !expense.eventId)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const groupMembers = snapshot.groupMembers.filter((member) => member.groupId === groupId && member.status === "active");
  const availableCurrencies = [...new Set<CurrencyCode>([
    ...expenses.map((expense) => expense.baseCurrency),
    ...events.map((event) => event.baseCurrency),
  ])];
  if (availableCurrencies.length === 0) availableCurrencies.push(group.currency);
  const selectedCurrency = availableCurrencies.includes(currency) ? currency : availableCurrencies[0];
  const spendingDays = groupSpendingByDay(
    groupId,
    selectedCurrency,
    snapshot.currentUser.id,
    snapshot.members,
    snapshot.groupMembers,
    snapshot.expenses,
  );
  const spendingValues = spendingDays.map((day) => spendingMode === "group" ? day.groupAmount : day.myAmount);
  const spendingTotal = spendingValues.reduce((sum, value) => sum + value, 0);
  const maxSpending = Math.max(...spendingValues, 1);
  const balances = groupNetBalancesByUser(
    groupId,
    selectedCurrency,
    snapshot.events,
    snapshot.members,
    snapshot.groupMembers,
    snapshot.expenses,
    snapshot.settlements,
  );
  const balanceRows = groupMembers
    .map((member) => ({ member, balance: balances.get(member.userId) ?? 0 }))
    .filter(({ balance }) => roundMoney(balance, selectedCurrency) !== 0)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const debts = simplifyBalances(balances, selectedCurrency);
  const isOwner = currentGroup.ownerId === snapshot.currentUser.id;

  function leaveCurrentGroup() {
    if (!window.confirm(`Leave ${currentGroup.name}? You will lose access to its events, expenses, balances, and receipts.`)) return;
    leaveGroup(currentGroup.id);
    router.push("/");
  }

  function deleteCurrentGroup() {
    if (deleteConfirmation !== currentGroup.name) return;
    deleteGroup(currentGroup.id);
    setDeleteModalOpen(false);
    router.push("/");
  }

  function closeDeleteModal() {
    setDeleteModalOpen(false);
    setDeleteConfirmation("");
  }

  function openDebtSettlement(debt: Debt, from: GroupMember, to: GroupMember) {
    setSelectedDebt({ debt, from, to });
    setDebtModalStep("review");
    setSettlementError("");
    setSettlementRecordId(undefined);
  }

  function closeDebtSettlement() {
    if (settlingDebt) return;
    setSelectedDebt(undefined);
    setDebtModalStep("review");
    setSettlementError("");
    setSettlementRecordId(undefined);
  }

  async function confirmDebtSettlement() {
    if (!selectedDebt) return;
    setSettlingDebt(true);
    setSettlementError("");
    try {
      const recordId = await addExpense({
        recordType: "transfer",
        groupId: currentGroup.id,
        description: `Debt settlement: ${selectedDebt.from.name} to ${selectedDebt.to.name}`,
        categoryId: "transfer",
        transactionDate: new Date().toISOString(),
        payerId: selectedDebt.from.id,
        amountOriginal: selectedDebt.debt.amount,
        currencyOriginal: selectedCurrency,
        baseCurrency: selectedCurrency,
        exchangeRate: 1,
        splitMethod: "exact",
        splitInputs: [{ memberId: selectedDebt.to.id, value: selectedDebt.debt.amount }],
        notes: "Created from Group Debt Relations",
      });
      setSettlementRecordId(recordId);
      setDebtModalStep("success");
    } catch (caught) {
      setSettlementError(caught instanceof Error ? caught.message : "Could not settle this debt.");
    } finally {
      setSettlingDebt(false);
    }
  }

  return (
    <div className="grid gap-7 animate-rise">
      <PageTitle
        eyebrow="Group"
        title={`${group.emoji} ${group.name}`}
        subtitle={group.description ?? "A shared space for your events and activities."}
        action={<div className="flex shrink-0 items-center gap-2"><Link href={`/groups/${group.id}/calendar`} className="grid size-11 place-items-center rounded-xl border border-line bg-white text-brand-dark card-shadow transition hover:border-brand hover:bg-brand-soft" aria-label="Open monthly calendar"><CalendarDays size={20} /></Link><Link href={`/expenses/new?groupId=${group.id}`} className="grid size-11 place-items-center rounded-xl bg-brand text-[#103a55]" aria-label="Add daily record"><Plus size={21} /></Link></div>}
      />

      <Card className="overflow-hidden p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="relative w-fit">
              <select aria-label="Spending view" value={spendingMode} onChange={(event) => setSpendingMode(event.target.value as "group" | "mine")} className="appearance-none bg-transparent pr-6 text-base font-extrabold outline-none">
                <option value="group">Group Spending</option>
                <option value="mine">My Spending</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1 text-muted" />
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-[-0.05em]">{formatMoney(spendingTotal, selectedCurrency)}</p>
            <p className="mt-1 text-xs text-muted">Last 7 days ending {formatShortDate(spendingDays.at(-1)?.date)}</p>
          </div>
          <select aria-label="Dashboard currency" value={selectedCurrency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs font-extrabold text-muted outline-none">
            {availableCurrencies.map((code) => <option key={code}>{code}</option>)}
          </select>
        </div>
        <div className="mt-6 grid grid-cols-7 items-end gap-2" aria-label={`${spendingMode === "group" ? "Group" : "My"} spending over seven days`}>
          {spendingDays.map((day, index) => {
            const value = spendingValues[index];
            const height = value > 0 ? Math.max(10, Math.round(value / maxSpending * 72)) : 4;
            return <div key={day.date} className="grid justify-items-center gap-2"><span className="text-[0.6rem] font-bold text-muted">{value > 0 ? compactMoney(value, selectedCurrency) : ""}</span><span title={`${day.date}: ${formatMoney(value, selectedCurrency)}`} className={`w-full max-w-7 rounded-t-md ${value > 0 ? "bg-brand" : "bg-slate-200"}`} style={{ height }} /><span className="text-[0.65rem] font-bold text-muted">{day.date.slice(8)}</span></div>;
          })}
        </div>
      </Card>

      {balanceRows.length > 0 && <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand-dark"><CircleDollarSign size={17} /></span><h2 className="font-extrabold">Net Balances</h2></div><span className="text-xs font-extrabold text-muted">{selectedCurrency}</span></div>
        <div className="divide-y divide-line">
          {balanceRows.map(({ member, balance }) => <div key={member.id} className="flex items-center gap-3 px-5 py-3.5"><Avatar name={member.name} color={member.avatarColor} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{member.userId === snapshot.currentUser.id ? `${member.name} (You)` : member.name}</p><p className="mt-0.5 text-[0.68rem] font-bold text-muted">{balance > 0 ? "is owed" : balance < 0 ? "owes" : "settled"}</p></div><p className={`text-sm font-extrabold ${balance > 0 ? "text-success" : balance < 0 ? "text-danger" : "text-muted"}`}>{balance > 0 ? "+" : ""}{formatMoney(balance, selectedCurrency)}</p></div>)}
        </div>
      </Card>}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="font-extrabold">Debt Relations</h2><span className="text-xs font-extrabold text-muted">{selectedCurrency}</span></div>
        {debts.length === 0 ? <div className="p-7 text-center"><p className="text-sm font-extrabold text-success">Everyone is settled up</p><p className="mt-1 text-xs text-muted">No payment is needed for this currency.</p></div> : <div className="divide-y divide-line">{debts.slice(0, 4).map((debt) => {
          const from = groupMembers.find((member) => member.userId === debt.fromMemberId);
          const to = groupMembers.find((member) => member.userId === debt.toMemberId);
          if (!from || !to) return null;
          return <button type="button" key={`${debt.fromMemberId}-${debt.toMemberId}`} onClick={() => openDebtSettlement(debt, from, to)} aria-label={`Settle debt: ${from.name} pays ${to.name} ${formatMoney(debt.amount, selectedCurrency)}`} className="grid w-full grid-cols-[74px_1fr_74px] items-center gap-2 px-4 py-5 text-center transition hover:bg-brand-soft/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-soft"><div className="grid justify-items-center gap-1.5"><Avatar name={from.name} color={from.avatarColor} /><p className="max-w-[74px] truncate text-xs font-extrabold">{from.name}</p></div><div><p className="text-[0.68rem] font-bold text-muted">needs to pay</p><div className="my-1.5 flex items-center"><span className="h-px flex-1 bg-slate-300" /><ArrowRight size={17} className="text-slate-400" /></div><p className="text-sm font-extrabold">{formatMoney(debt.amount, selectedCurrency)}</p><p className="mt-1 text-[0.62rem] font-extrabold text-brand-dark">Tap to settle</p></div><div className="grid justify-items-center gap-1.5"><Avatar name={to.name} color={to.avatarColor} /><p className="max-w-[74px] truncate text-xs font-extrabold">{to.name}</p></div></button>;
        })}</div>}
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div><h2 className="text-lg font-extrabold tracking-tight">Daily records</h2><p className="mt-0.5 text-xs text-muted">Expenses, income, and member transfers without an event.</p></div>
          <Link href={`/expenses/new?groupId=${group.id}`} className="text-sm font-bold text-brand-dark">Add record</Link>
        </div>
        {dailyExpenses.length === 0 ? (
          <Card><EmptyState icon={<ReceiptText size={24} />} title="No daily records yet" body="Add an expense, income, or transfer directly to this group." action={<Link href={`/expenses/new?groupId=${group.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-extrabold text-[#103a55]">Add daily record</Link>} /></Card>
        ) : (
          <Card className="divide-y divide-line p-0">
            {dailyExpenses.slice(0, 5).map((expense) => {
              const category = snapshot.categories.find((item) => item.id === expense.categoryId);
              const payer = snapshot.groupMembers.find((member) => member.id === expense.payerId);
              const verb = expense.recordType === "expense" ? "paid" : expense.recordType === "income" ? "received" : "sent";
              return <Link key={expense.id} href={`/expenses/${expense.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 first:rounded-t-[1.25rem] last:rounded-b-[1.25rem]"><span className={`grid size-10 place-items-center rounded-xl text-lg ${expense.recordType === "income" ? "bg-success-soft" : "bg-brand-soft"}`}>{category?.emoji ?? "🧾"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{expense.description}</p><p className="mt-0.5 text-xs text-muted">{payer?.name ?? "Member"} {verb} · {new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(expense.transactionDate))}</p></div><p className={`text-sm font-extrabold ${expense.recordType === "income" ? "text-success" : expense.recordType === "transfer" ? "text-brand-dark" : ""}`}>{expense.recordType === "income" ? "+" : ""}{formatMoney(expense.amountOriginal, expense.currencyOriginal)}</p></Link>;
            })}
          </Card>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <button type="button" aria-expanded={eventsOpen} onClick={() => setEventsOpen((open) => !open)} className="flex min-w-0 items-center gap-2 text-left"><div><h2 className="text-lg font-extrabold tracking-tight">Events</h2><p className="mt-0.5 text-xs text-muted">{eventsOpen ? "Hide" : "Show"} optional trips and activities.</p></div>{eventsOpen ? <ChevronUp size={19} className="shrink-0 text-muted" /> : <ChevronDown size={19} className="shrink-0 text-muted" />}</button>
          <Link href={`/events/new?groupId=${group.id}`} className="shrink-0 text-sm font-bold text-brand-dark">Add event</Link>
        </div>
        {eventsOpen && (events.length === 0 ? (
          <Card><EmptyState icon={<CalendarPlus size={24} />} title="No events yet" body={`That’s okay—events are optional. Create one when ${group.name} has a specific trip or activity.`} action={<Link href={`/events/new?groupId=${group.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-extrabold text-[#103a55]">Create event</Link>} /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((event) => {
              const activeMembers = snapshot.members.filter((member) => member.eventId === event.id && member.status === "active").length;
              const dates = event.startDate ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${event.startDate}T12:00:00`)) : "No date";
              return (
                <Link key={event.id} href={`/events/${event.id}`} className="group rounded-[1.25rem] border border-line bg-white p-4 card-shadow transition hover:-translate-y-0.5 hover:border-brand">
                  <div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-2xl">{event.emoji}</span><ChevronRight size={18} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-dark" /></div>
                  <h3 className="mt-3 font-extrabold tracking-tight">{event.name}</h3>
                  <p className="mt-1 text-xs text-muted">{dates} · {activeMembers} {activeMembers === 1 ? "member" : "members"}</p>
                  <p className="mt-3 text-sm font-bold text-ink">{formatMoney(totalEventSpending(event.id, snapshot.expenses), event.baseCurrency)} spent</p>
                </Link>
              );
            })}
          </div>
        ))}
      </section>

      <GroupNotesCard key={`${group.id}:${group.notes ?? ""}`} initialNotes={group.notes ?? ""} onSave={(notes) => updateGroupNotes(group.id, notes)} />

      <Card className="grid grid-cols-3 gap-2 border-0 bg-gradient-to-br from-[#dff2ff] via-[#f2f9fe] to-white p-5">
        <Summary value={events.length} label={events.length === 1 ? "Event" : "Events"} icon={<CalendarDays size={18} />} />
        <Summary value={groupMembers.length} label={groupMembers.length === 1 ? "Person" : "People"} icon={<UsersRound size={18} />} />
        <Summary value={expenses.length} label={expenses.length === 1 ? "Record" : "Records"} icon={<ReceiptText size={18} />} />
      </Card>

      <Link href={`/groups/${group.id}/members`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-4 card-shadow"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><UserPlus size={19} /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">Members & invitations</p><p className="mt-0.5 text-xs text-muted">Approve people for the whole group</p></div><ChevronRight size={18} className="text-slate-300" /></Link>
      <Link href={`/groups/${group.id}/settings`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-4 card-shadow"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Settings size={19} /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">Group settings</p><p className="mt-0.5 text-xs text-muted">Currency: {group.currency}</p></div><ChevronRight size={18} className="text-slate-300" /></Link>

      <Card className="overflow-hidden border-danger/20">
        <div className="p-5">
          <h2 className="font-extrabold">Group actions</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{isOwner ? "Only the owner can permanently delete this group. The Google workbook is cleaned during the next successful sync." : "Leaving removes this group from your app while preserving its history for the remaining members."}</p>
        </div>
        <div className="border-t border-line p-4">
          {isOwner
            ? <Button type="button" variant="danger" className="w-full" onClick={() => { setDeleteConfirmation(""); setDeleteModalOpen(true); }}><Trash2 size={17} /> Delete group</Button>
            : <Button type="button" variant="danger" className="w-full" onClick={leaveCurrentGroup}><LogOut size={17} /> Leave group</Button>}
        </div>
      </Card>

      {selectedDebt && <DebtSettlementModal
        selection={selectedDebt}
        currency={selectedCurrency}
        groupName={currentGroup.name}
        step={debtModalStep}
        settling={settlingDebt}
        error={settlementError}
        recordId={settlementRecordId}
        onClose={closeDebtSettlement}
        onSettle={() => setDebtModalStep("confirm")}
        onBack={() => setDebtModalStep("review")}
        onConfirm={confirmDebtSettlement}
      />}
      {deleteModalOpen && <DeleteGroupModal
        groupName={currentGroup.name}
        confirmation={deleteConfirmation}
        onConfirmationChange={setDeleteConfirmation}
        onClose={closeDeleteModal}
        onConfirm={deleteCurrentGroup}
      />}
    </div>
  );
}

function DeleteGroupModal({ groupName, confirmation, onConfirmationChange, onClose, onConfirm }: {
  groupName: string;
  confirmation: string;
  onConfirmationChange(value: string): void;
  onClose(): void;
  onConfirm(): void;
}) {
  const confirmed = confirmation === groupName;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed) onConfirm();
  }

  return (
    <div className="fixed inset-0 z-[80] grid items-end bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
      <button type="button" className="absolute inset-0" aria-label="Cancel deleting group" onClick={onClose} />
      <section className="safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-danger">Permanent action</p><h2 id="delete-group-title" className="mt-1 text-xl font-extrabold tracking-tight">Delete <strong>&quot;{groupName}&quot;</strong>?</h2></div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="mt-5 rounded-xl bg-danger-soft p-4 text-sm leading-6 text-ink">
          This permanently removes the group, events, records, balances, invitations, receipts, and its Google Sheet after sync. This cannot be undone.
        </div>

        <form className="mt-5" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-bold" htmlFor="delete-group-confirmation">
            <span>If you want to delete this group, type <strong>&quot;{groupName}&quot;</strong> and confirm.</span>
            <input
              id="delete-group-confirmation"
              aria-label="Group name confirmation"
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder={groupName}
              autoComplete="off"
              autoFocus
              className="min-h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base outline-none placeholder:text-slate-300 focus:border-danger focus:ring-4 focus:ring-danger-soft"
            />
          </label>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!confirmed}><Trash2 size={16} /> Confirm delete</Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DebtSettlementModal({ selection, currency, groupName, step, settling, error, recordId, onClose, onSettle, onBack, onConfirm }: {
  selection: { debt: Debt; from: GroupMember; to: GroupMember };
  currency: CurrencyCode;
  groupName: string;
  step: "review" | "confirm" | "success";
  settling: boolean;
  error: string;
  recordId?: string;
  onClose(): void;
  onSettle(): void;
  onBack(): void;
  onConfirm(): void;
}) {
  const { debt, from, to } = selection;
  return (
    <div className="fixed inset-0 z-[70] grid items-end bg-slate-950/40 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="debt-settlement-title">
      <button type="button" className="absolute inset-0" aria-label="Close debt settlement" onClick={onClose} />
      <section className="safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-brand-dark">Debt relation</p><h2 id="debt-settlement-title" className="mt-1 text-xl font-extrabold tracking-tight">{step === "confirm" ? "Confirm settlement" : step === "success" ? "Debt settled" : "Settle debt"}</h2></div>
          <button type="button" onClick={onClose} disabled={settling} className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted disabled:opacity-50" aria-label="Close"><X size={20} /></button>
        </div>

        {step === "success" ? <div className="py-7 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 size={32} /></span>
          <p className="mt-4 text-lg font-extrabold">Transfer recorded</p>
          <p className="mt-2 text-sm leading-6 text-muted">{from.name} paid {to.name} {formatMoney(debt.amount, currency)}. The Group balances have been updated.</p>
          <div className="mt-6 grid gap-2">{recordId && <Link href={`/expenses/${recordId}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 text-sm font-extrabold text-[#103a55]">View transfer</Link>}<Button type="button" variant="secondary" onClick={onClose}>Done</Button></div>
        </div> : <>
          <div className="mt-6 grid grid-cols-[82px_1fr_82px] items-center gap-2 text-center">
            <div className="grid justify-items-center gap-2"><Avatar name={from.name} color={from.avatarColor} /><p className="w-full truncate text-xs font-extrabold">{from.name}</p></div>
            <div><p className="text-[0.68rem] font-bold text-muted">pays</p><div className="my-2 flex items-center"><span className="h-px flex-1 bg-slate-300" /><ArrowRight size={18} className="text-slate-400" /></div><p className="text-lg font-extrabold">{formatMoney(debt.amount, currency)}</p></div>
            <div className="grid justify-items-center gap-2"><Avatar name={to.name} color={to.avatarColor} /><p className="w-full truncate text-xs font-extrabold">{to.name}</p></div>
          </div>
          <div className={`mt-6 rounded-xl p-4 text-sm leading-6 ${step === "confirm" ? "bg-warning-soft text-ink" : "bg-slate-50 text-muted"}`}>
            {step === "confirm" ? <>Confirm this payment was made. Bill Moshi will add a <strong>Transfer</strong> record to {groupName} and update the debt relation.</> : <>This creates a daily Group <strong>Transfer</strong> record. Original expenses and Event history stay unchanged.</>}
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
          {step === "confirm" ? <div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onBack} disabled={settling}>Back</Button><Button type="button" onClick={onConfirm} disabled={settling} autoFocus>{settling ? "Recording…" : "Confirm transfer"}</Button></div> : <div className="mt-6 grid gap-2"><Button type="button" onClick={onSettle} autoFocus>Settle debt</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>}
        </>}
      </section>
    </div>
  );
}

function GroupNotesCard({ initialNotes, onSave }: { initialNotes: string; onSave(notes: string): void }) {
  const [notes, setNotes] = useState(initialNotes);
  const changed = notes.trim() !== initialNotes;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2"><NotebookPen size={18} className="text-brand-dark" /><h2 className="font-extrabold">Notes</h2></div>
      <textarea aria-label="Group notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Leave a note for this group" className="w-full resize-none rounded-xl border border-line bg-slate-50 px-4 py-3 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand-soft" />
      {changed && <div className="mt-3 flex justify-end"><Button type="button" onClick={() => onSave(notes)}><Save size={16} /> Save note</Button></div>}
    </Card>
  );
}

function Summary({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl bg-white/80 px-3 py-4 text-center"><span className="mx-auto grid size-8 place-items-center rounded-xl bg-brand-soft text-brand-dark">{icon}</span><p className="mt-2 text-xl font-extrabold">{value}</p><p className="text-[0.68rem] font-bold text-muted">{label}</p></div>;
}

function formatShortDate(date?: string) {
  if (!date) return "today";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00.000Z`));
}

function compactMoney(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, notation: "compact", maximumFractionDigits: 0 }).format(value);
}
