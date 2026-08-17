"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, Plus, ReceiptText, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { eventNetBalances, formatMoney, groupCurrencyBalancesForUser, groupDailyNetBalances, overallReportingBalanceForUser, recordsMissingReportingRate } from "@/lib/domain/calculations";
import { Card, PageTitle } from "@/components/ui/primitives";
import type { CurrencyCode } from "@/lib/domain/types";

export function HomeScreen() {
  const { snapshot, selectedGroupId, personalContext, selectGroup } = useBillMoshi();

  useEffect(() => {
    if (selectedGroupId || personalContext) selectGroup(undefined);
  }, [personalContext, selectGroup, selectedGroupId]);

  const recentExpenses = snapshot.expenses
    .toSorted((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
    .slice(0, 6);
  const totals = new Map<CurrencyCode, number>();
  for (const event of snapshot.events) {
    const currentMember = snapshot.members.find((member) => member.eventId === event.id && member.userId === snapshot.currentUser.id);
    if (!currentMember) continue;
    const balance = eventNetBalances(event.id, snapshot.members, snapshot.expenses, snapshot.settlements).get(currentMember.id) ?? 0;
    totals.set(event.baseCurrency, (totals.get(event.baseCurrency) ?? 0) + balance);
  }
  for (const group of snapshot.groups) {
    const currentMember = snapshot.groupMembers.find((member) => member.groupId === group.id && member.userId === snapshot.currentUser.id);
    if (!currentMember) continue;
    const currencies = new Set(snapshot.expenses
      .filter((expense) => expense.groupId === group.id && !expense.eventId)
      .map((expense) => expense.baseCurrency));
    for (const currency of currencies) {
      const balance = groupDailyNetBalances(group.id, currency, snapshot.groupMembers, snapshot.expenses).get(currentMember.id) ?? 0;
      totals.set(currency, (totals.get(currency) ?? 0) + balance);
    }
  }
  const primaryTotal = [...totals][0] ?? ["CAD", 0];
  const [, originalPrimaryBalance] = primaryTotal;
  const reportingCurrency = snapshot.currentUser.defaultCurrency;
  const reportingSummary = overallReportingBalanceForUser(snapshot.currentUser.id, reportingCurrency, snapshot.members, snapshot.groupMembers, snapshot.expenses, snapshot.settlements);
  const missingRates = recordsMissingReportingRate(snapshot.expenses, reportingCurrency);
  const primaryCurrency = reportingCurrency;
  const primaryBalance = reportingSummary.balance;
  const reportingIncomplete = missingRates.length > 0 || reportingSummary.missingSettlementCount > 0;

  return (
    <div className="grid min-w-0 gap-7">
      <PageTitle title={`Hi, ${snapshot.currentUser.name.split(" ")[0]} 👋`} subtitle="Here’s where your shared spending stands." action={<Link href="/calendar" aria-label="Open monthly calendar" className="grid size-11 place-items-center rounded-xl border border-line bg-white text-brand-dark card-shadow transition-colors hover:border-brand hover:bg-brand-soft"><CalendarDays size={20} /></Link>} />

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-balance-start via-balance-middle to-white p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-dark">Overall balance</p>
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-muted">All groups</span>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className={`text-sm font-bold ${primaryBalance >= 0 ? "text-success" : "text-danger"}`}>{reportingIncomplete ? "Converted subtotal" : primaryBalance > 0 ? "You are owed" : primaryBalance < 0 ? "You owe" : "You’re all settled"}</p>
            <p className="mt-1 text-[2.15rem] font-extrabold leading-none tracking-[-0.055em] text-ink">{formatMoney(Math.abs(primaryBalance), primaryCurrency as CurrencyCode)}</p>
          </div>
          <div className={`grid size-12 place-items-center rounded-2xl ${primaryBalance >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{primaryBalance >= 0 ? <ArrowDownLeft size={23} /> : <ArrowUpRight size={23} />}</div>
        </div>
        <p className="mt-4 text-xs text-muted">Saved-rate reporting in {reportingCurrency}{totals.size > 0 ? ` · Original balances: ${[...totals].map(([currency, value]) => `${formatMoney(Math.abs(value), currency)} ${value >= 0 ? "owed" : "owing"}`).join(" · ")}` : ""}{originalPrimaryBalance === 0 && totals.size === 0 ? " · No shared balance yet" : ""}</p>
        <Link href="/records/missing-rates" className={`mt-4 flex min-h-11 items-center justify-between rounded-xl px-3.5 text-sm font-extrabold ${missingRates.length > 0 ? "bg-warning-soft text-warning" : "bg-white/80 text-brand-dark"}`}><span>{missingRates.length > 0 ? `${missingRates.length} older ${missingRates.length === 1 ? "record needs" : "records need"} a rate` : "All record exchange rates complete"}</span><ChevronRight size={17} /></Link>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-extrabold tracking-tight">Your groups</h2><p className="mt-0.5 text-xs text-muted">Family, roommates, friends, and teams.</p></div><Link href="/groups/new" className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-bold text-brand-dark">New group</Link></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {snapshot.groups.slice(0, 4).map((group) => {
            const events = snapshot.events.filter((event) => event.groupId === group.id);
            const dailyCount = snapshot.expenses.filter((expense) => expense.groupId === group.id && !expense.eventId).length;
            const memberCount = snapshot.groupMembers.filter((member) => member.groupId === group.id && member.status === "active").length;
            const latestEvent = events.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            const myBalances = groupCurrencyBalancesForUser(group.id, snapshot.currentUser.id, snapshot.events, snapshot.members, snapshot.groupMembers, snapshot.expenses, snapshot.settlements);
            return <Link key={group.id} href={`/groups/${group.id}`} className="rounded-[1.25rem] border border-line bg-white p-4 card-shadow transition hover:-translate-y-0.5 hover:border-brand"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-2xl">{group.emoji}</span><ChevronRight size={18} className="text-slate-300" /></div><h3 className="mt-3 font-extrabold tracking-tight">{group.name}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><UsersRound size={13} /> {memberCount} {memberCount === 1 ? "person" : "people"}</p>{myBalances.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{myBalances.map(({ currency, balance }) => <span key={currency} className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${balance < 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>{balance < 0 ? "You owe" : "You are owed"} {formatMoney(Math.abs(balance), currency)}</span>)}</div>}<p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-ink"><CalendarDays size={15} className="text-brand-dark" /> {events.length} {events.length === 1 ? "event" : "events"} · {dailyCount} daily {dailyCount === 1 ? "record" : "records"}{latestEvent ? ` · Latest: ${latestEvent.name}` : ""}</p></Link>;
          })}
          <Link href="/groups/new" className="flex min-h-40 items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-brand bg-brand-soft/50 text-sm font-extrabold text-brand-dark"><Plus size={20} /> Create a group</Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-extrabold tracking-tight">Recent records</h2><p className="mt-0.5 text-xs text-muted">All groups + Myself</p></div><Link href="/records" className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-bold text-brand-dark">View records</Link></div>
        <Card className="divide-y divide-line overflow-hidden">
          {recentExpenses.length === 0 ? <div className="p-7 text-center text-sm text-muted">No records yet.</div> : recentExpenses.map((expense) => {
            const category = snapshot.categories.find((item) => item.id === expense.categoryId);
            const event = snapshot.events.find((item) => item.id === expense.eventId);
            const group = snapshot.groups.find((item) => item.id === expense.groupId);
            const payer = snapshot.members.find((item) => item.id === expense.payerId) ?? snapshot.groupMembers.find((item) => item.id === expense.payerId) ?? (expense.payerId === snapshot.currentUser.id ? snapshot.currentUser : undefined);
            const verb = expense.recordType === "expense" ? "paid" : expense.recordType === "income" ? "received" : "sent";
            return <Link href={`/expenses/${expense.id}`} key={expense.id} className="flex items-center gap-3 p-4 transition hover:bg-slate-50"><span className={`grid size-10 place-items-center rounded-xl text-xl ${expense.recordType === "income" ? "bg-success-soft" : expense.recordType === "transfer" ? "bg-brand-soft" : "bg-slate-50"}`}>{category?.emoji ?? "🧾"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{expense.description}</p><p className="mt-0.5 truncate text-xs text-muted">{!expense.groupId ? "Myself · Personal" : event?.name ?? `${group?.name ?? "Group"} · Daily`} · {payer?.name} {verb}</p></div><div className="text-right"><p className={`text-sm font-extrabold ${expense.recordType === "income" ? "text-success" : expense.recordType === "transfer" ? "text-brand-dark" : ""}`}>{expense.recordType === "income" ? "+" : ""}{formatMoney(expense.amountOriginal, expense.currencyOriginal)}</p><p className={`mt-0.5 text-[0.68rem] font-bold ${expense.syncStatus === "synced" ? "text-success" : "text-warning"}`}>{expense.syncStatus === "synced" ? "Synced" : "Pending"}</p></div></Link>;
          })}
        </Card>
      </section>

      <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-muted"><ReceiptText size={15} /> Expenses stay yours in Google Sheets and Drive.</div>
    </div>
  );
}
