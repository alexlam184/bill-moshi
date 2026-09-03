"use client";

import { ArrowRight, ChevronRight, CircleDollarSign, Plus, ReceiptText, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Card, EmptyState, PageTitle, fieldClass } from "@/components/ui/primitives";
import { recordMatchesRecordContext, recordRelatedToUser, formatMoney, memberIdsForUser, settlementRelatedToUser } from "@/lib/domain/calculations";
import { dateFilterRange, dateInRange, type DateFilterPreset } from "@/lib/domain/date-filter";
import { useQueryState } from "@/lib/hooks/use-query-state";

export function RecordsScreen({ mineOnly = false }: { mineOnly?: boolean }) {
  const { snapshot, selectedGroupId } = useBillMoshi();
  const [tab, setTab] = useQueryState<"records" | "settlements">("tab", "records", ["records", "settlements"]);
  const activeTab = mineOnly ? "records" : tab;
  const [groupId, setGroupId] = useQueryState<string>("group", mineOnly ? "personal" : "all");
  const [eventScope, setEventScope] = useQueryState<string>("event", "all");
  const [query, setQuery] = useQueryState<string>("query", "");
  const [datePreset, setDatePreset] = useQueryState<DateFilterPreset>("date", "all", ["all", "today", "last7", "last30", "month", "year", "custom"]);
  const [customFrom, setCustomFrom] = useQueryState<string>("from", "");
  const [customTo, setCustomTo] = useQueryState<string>("to", "");
  const dateRange = useMemo(() => dateFilterRange(datePreset, new Date(), {
    start: customFrom || undefined,
    end: customTo || undefined,
  }), [customFrom, customTo, datePreset]);
  const dateError = Boolean(dateRange.start && dateRange.end && dateRange.start > dateRange.end);
  const myMemberIds = useMemo(() => memberIdsForUser(
    snapshot.currentUser.id,
    snapshot.members,
    snapshot.groupMembers,
  ), [snapshot.currentUser.id, snapshot.groupMembers, snapshot.members]);
  const currentGroup = mineOnly ? undefined : snapshot.groups.find((group) => group.id === selectedGroupId);
  const effectiveGroupId = mineOnly ? "personal" : currentGroup?.id ?? groupId;
  const availableEvents = effectiveGroupId === "personal" ? [] : snapshot.events.filter((event) => effectiveGroupId === "all" || event.groupId === effectiveGroupId);
  const records = useMemo(() => snapshot.records
    .filter((record) => !mineOnly || recordRelatedToUser(record, snapshot.currentUser.id, myMemberIds))
    .filter((record) => recordMatchesRecordContext(record, effectiveGroupId))
    .filter((record) => eventScope === "all" || (eventScope === "daily" ? !record.eventId : record.eventId === eventScope))
    .filter((record) => !dateError && dateInRange(record.transactionDate, dateRange))
    .filter((record) => {
      const event = snapshot.events.find((item) => item.id === record.eventId);
      const group = snapshot.groups.find((item) => item.id === record.groupId);
      const payer = snapshot.members.find((member) => member.id === record.payerId) ?? snapshot.groupMembers.find((member) => member.id === record.payerId) ?? (record.payerId === snapshot.currentUser.id ? snapshot.currentUser : undefined);
      return `${record.recordType} ${record.description} ${record.notes ?? ""} ${group?.name ?? "personal"} ${event?.name ?? "daily"} ${payer?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)), [dateError, dateRange, effectiveGroupId, eventScope, mineOnly, myMemberIds, query, snapshot]);
  const settlements = snapshot.settlements
    .filter((settlement) => !mineOnly || settlementRelatedToUser(settlement, snapshot.currentUser.id, myMemberIds))
    .filter((settlement) => eventScope === "all" || (eventScope !== "daily" && settlement.events.some((item) => item.eventId === eventScope)))
    .filter((settlement) => effectiveGroupId !== "personal" && (effectiveGroupId === "all" || settlement.events.some((item) => snapshot.events.find((event) => event.id === item.eventId)?.groupId === effectiveGroupId)))
    .filter((settlement) => !dateError && dateInRange(settlement.date, dateRange))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="grid min-w-0 gap-6">
      <PageTitle title={mineOnly ? "My Records" : "Records"} subtitle={mineOnly ? "Only income and expenses that belong to your personal account." : currentGroup ? `Only records from ${currentGroup.name}. Change groups from the hamburger menu.` : "Personal and shared records together, with filters for each context."} action={<Link href={mineOnly ? "/records/new?personal=1" : currentGroup ? `/records/new?groupId=${currentGroup.id}` : "/records/new"} className="grid size-11 place-items-center rounded-xl bg-brand text-brand-ink hover:bg-brand-hover" aria-label="Add record"><Plus size={20} /></Link>} />
      {mineOnly && <div className="flex items-start gap-3 rounded-xl border border-brand/40 bg-brand-soft/60 p-4 text-sm text-brand-dark"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white"><UserRound size={18} /></span><div><p className="font-extrabold">{snapshot.currentUser.name}&apos;s personal records</p><p className="mt-1 leading-5 text-muted">These records belong only to you and have no group or event. Transfers require a group with another member.</p></div></div>}
      {!mineOnly && <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        <button type="button" aria-pressed={activeTab === "records"} onClick={() => setTab("records")} className={`min-h-11 rounded-lg text-sm font-extrabold transition-colors hover:text-ink ${activeTab === "records" ? "bg-white text-ink shadow-sm" : "text-muted hover:bg-white/70"}`}>Records</button>
        <button type="button" aria-pressed={activeTab === "settlements"} onClick={() => setTab("settlements")} className={`min-h-11 rounded-lg text-sm font-extrabold transition-colors hover:text-ink ${activeTab === "settlements" ? "bg-white text-ink shadow-sm" : "text-muted hover:bg-white/70"}`}>Settlements</button>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" size={18} /><input aria-label="Search records" name="record-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldClass} pl-11`} placeholder="Search records…" /></div>
        {!mineOnly && !currentGroup && <select aria-label="Filter by group" name="record-group" autoComplete="off" value={groupId} onChange={(event) => { setGroupId(event.target.value); setEventScope("all"); }} className={`${fieldClass} text-sm`}><option value="all">All Groups + Myself</option>{snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>)}</select>}
        {!mineOnly && <select aria-label="Filter by event" name="record-event" autoComplete="off" value={eventScope} onChange={(event) => setEventScope(event.target.value)} className={`${fieldClass} text-sm`}><option value="all">All Records</option><option value="daily">Daily Records</option>{availableEvents.map((event) => { const group = snapshot.groups.find((item) => item.id === event.groupId); return <option key={event.id} value={event.id}>{effectiveGroupId === "all" ? `${group?.emoji ?? ""} ` : ""}{event.emoji} {event.name}</option>; })}</select>}
        <select aria-label="Filter by date" name="record-date" autoComplete="off" value={datePreset} onChange={(event) => setDatePreset(event.target.value as DateFilterPreset)} className={`${fieldClass} text-sm`}>
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
          <option value="custom">Custom range</option>
        </select>
      </div>
      {datePreset === "custom" && <div className="grid gap-3 rounded-xl border border-line bg-slate-50 p-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-extrabold text-muted">From<input aria-label="Records start date" name="record-start-date" autoComplete="off" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className={fieldClass} /></label>
        <label className="grid gap-1.5 text-xs font-extrabold text-muted">To<input aria-label="Records end date" name="record-end-date" autoComplete="off" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className={fieldClass} /></label>
        {dateError && <p role="alert" aria-live="polite" className="text-xs font-bold text-danger sm:col-span-2">Start date must be on or before the end date.</p>}
      </div>}

      {activeTab === "records" ? <Card className="divide-y divide-line overflow-hidden">{records.length === 0 ? <EmptyState icon={<ReceiptText size={24} />} title="No records found" body="Change your search or add a new record." /> : records.map((record) => {
        const event = snapshot.events.find((item) => item.id === record.eventId);
        const group = snapshot.groups.find((item) => item.id === record.groupId);
        const category = snapshot.categories.find((item) => item.id === record.categoryId);
        const payer = snapshot.members.find((member) => member.id === record.payerId) ?? snapshot.groupMembers.find((member) => member.id === record.payerId) ?? (record.payerId === snapshot.currentUser.id ? snapshot.currentUser : undefined);
        const verb = record.recordType === "expense" ? "paid" : record.recordType === "income" ? "received" : "sent";
        return <Link href={`/records/${record.id}`} key={record.id} className="virtual-list-item flex items-center gap-3 p-4 transition hover:bg-slate-50"><span className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl ${record.recordType === "income" ? "bg-success-soft" : record.recordType === "transfer" ? "bg-brand-soft" : "bg-slate-50"}`}>{category?.emoji ?? "🧾"}</span><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-extrabold">{record.description}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold capitalize ${record.recordType === "income" ? "bg-success-soft text-success" : record.recordType === "transfer" ? "bg-brand-soft text-brand-dark" : "bg-slate-100 text-muted"}`}>{record.recordType}</span></div><p className="mt-1 truncate text-xs text-muted">{!record.groupId ? "👤 Myself · Personal" : event ? `${event.emoji} ${event.name}` : `${group?.emoji ?? ""} ${group?.name ?? "Group"} · Daily`} · {payer?.name} {verb}</p><p className="mt-1 text-[0.68rem] text-muted">{new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(record.transactionDate))}</p></div><div className="text-right"><p className={`text-sm font-extrabold ${record.recordType === "income" ? "text-success" : record.recordType === "transfer" ? "text-brand-dark" : ""}`}>{record.recordType === "income" ? "+" : ""}{formatMoney(record.amountOriginal, record.currencyOriginal)}</p><p className={`mt-1 text-[0.68rem] font-bold ${record.syncStatus === "synced" ? "text-success" : "text-warning"}`}>{record.syncStatus === "synced" ? "Synced" : "Pending"}</p></div><ChevronRight size={17} className="text-slate-300" /></Link>;
      })}</Card> : <Card className="divide-y divide-line overflow-hidden">{settlements.length === 0 ? <EmptyState icon={<CircleDollarSign size={24} />} title="No settlements yet" body="Recorded payments will appear here without changing the original expenses." action={<Link href="/settle" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-brand-ink">Settle up</Link>} /> : settlements.map((settlement) => {
        const from = snapshot.members.find((member) => member.id === settlement.fromMemberId) ?? snapshot.groupMembers.find((member) => member.id === settlement.fromMemberId);
        const to = snapshot.members.find((member) => member.id === settlement.toMemberId) ?? snapshot.groupMembers.find((member) => member.id === settlement.toMemberId);
        return <div key={settlement.id} className="virtual-list-item flex items-center gap-3 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><CircleDollarSign size={20} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{from?.name ?? "Member"} <ArrowRight className="mx-1 inline" size={14} /> {to?.name ?? "Member"}</p><p className="mt-1 text-xs text-muted">{settlement.paymentMethod} · {settlement.scope} scope</p><p className="mt-1 text-[0.68rem] text-slate-400">{new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(settlement.date))}</p></div><p className="text-sm font-extrabold">{formatMoney(settlement.amount, settlement.currency)}</p></div>;
      })}</Card>}
    </div>
  );
}
