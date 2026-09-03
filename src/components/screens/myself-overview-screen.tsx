"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronRight, Plus, ReceiptText, Repeat2, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Card, EmptyState, PageTitle } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/calculations";
import type { LedgerRecord } from "@/lib/domain/types";

export function MyselfOverviewScreen() {
  const { snapshot, personalContext, selectPersonal } = useBillMoshi();
  const currency = snapshot.currentUser.defaultCurrency;
  const records = snapshot.records
    .filter((record) => !record.groupId && !record.eventId)
    .toSorted((left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime());
  const amountInDefaultCurrency = (record: LedgerRecord) => {
    if (record.baseCurrency === currency) return record.amountBase;
    if (record.reportingCurrency === currency && record.amountReporting !== undefined) return record.amountReporting;
    return 0;
  };
  const income = records.filter((record) => record.recordType === "income").reduce((sum, record) => sum + amountInDefaultCurrency(record), 0);
  const expenseTotal = records.filter((record) => record.recordType === "expense").reduce((sum, record) => sum + amountInDefaultCurrency(record), 0);
  const balance = income - expenseTotal;
  const recentRecords = records.slice(0, 6);
  const missingRateCount = records.filter((record) => record.baseCurrency !== currency && !(record.reportingCurrency === currency && record.amountReporting !== undefined)).length;

  useEffect(() => {
    if (!personalContext) selectPersonal();
  }, [personalContext, selectPersonal]);

  return (
    <div className="grid gap-6">
      <PageTitle eyebrow="Personal overview" title="Myself" subtitle="Private income and expenses that do not belong to any group." action={<Link href="/records/new?personal=1" className="grid size-11 place-items-center rounded-xl bg-brand text-brand-ink" aria-label="Add personal record"><Plus size={20} /></Link>} />

      <Link href="/myself/recurring" className="flex items-center gap-3 rounded-xl border border-line p-4 hover:bg-brand-soft"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Repeat2 size={22} /></span><div className="min-w-0 flex-1"><p className="font-extrabold">Recurring payments</p><p className="mt-1 text-xs text-muted">Personal bills, upcoming payments, and history</p></div><ChevronRight size={18} className="text-muted" /></Link>

      <section className="rounded-[1.6rem] bg-gradient-to-br from-balance-start via-balance-middle to-white p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-dark">Personal balance</p><span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-extrabold text-muted"><UserRound size={14} /> Private</span></div>
        <div className="mt-5 flex items-end justify-between gap-4"><div><p className={`text-sm font-extrabold ${balance >= 0 ? "text-success" : "text-danger"}`}>{balance > 0 ? "Net income" : balance < 0 ? "Net spending" : "Balanced"}</p><p className="mt-1 text-[2.15rem] font-extrabold leading-none tracking-[-0.055em]">{formatMoney(Math.abs(balance), currency)}</p></div><span className={`grid size-12 place-items-center rounded-2xl ${balance >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{balance >= 0 ? <ArrowDownLeft size={23} /> : <ArrowUpRight size={23} />}</span></div>
        <p className="mt-4 text-xs text-muted">Income minus expenses in your default currency · No settlement needed</p>
        {missingRateCount > 0 && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs font-bold text-warning">{missingRateCount} older {missingRateCount === 1 ? "record is" : "records are"} excluded until a conversion rate is saved.</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Personal record totals">
        <SummaryCard label="Income" value={formatMoney(income, currency)} tone="success" />
        <SummaryCard label="Expense" value={formatMoney(expenseTotal, currency)} tone="danger" />
        <SummaryCard label="Balance" value={formatMoney(balance, currency)} tone={balance < 0 ? "danger" : "success"} />
        <SummaryCard label="Records" value={String(records.length)} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold tracking-tight">Recent records</h2><p className="mt-0.5 text-xs text-muted">Newest personal records first</p></div><Link href="/records/mine" className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-extrabold text-brand-dark">View records <ChevronRight size={16} /></Link></div>
        <Card className="divide-y divide-line overflow-hidden">
          {recentRecords.length === 0 ? <EmptyState icon={<WalletCards size={24} />} title="No personal records" body="Add an income or expense that belongs only to you." action={<Link href="/records/new?personal=1" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-extrabold text-brand-ink"><Plus size={17} /> Add record</Link>} /> : recentRecords.map((record) => {
            const category = snapshot.categories.find((item) => item.id === record.categoryId);
            return <Link key={record.id} href={`/records/${record.id}`} className="flex items-center gap-3 p-4 transition hover:bg-slate-50"><span className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl ${record.recordType === "income" ? "bg-success-soft" : "bg-slate-50"}`}>{category?.emoji ?? "🧾"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{record.description}</p><p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(record.transactionDate))} · {record.syncStatus === "synced" ? "Synced" : "Pending"}</p></div><div className="text-right"><p className={`text-sm font-extrabold ${record.recordType === "income" ? "text-success" : ""}`}>{record.recordType === "income" ? "+" : ""}{formatMoney(record.amountOriginal, record.currencyOriginal)}</p><ChevronRight size={17} className="ml-auto mt-1 text-slate-300" /></div></Link>;
          })}
        </Card>
      </section>

      <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-muted"><ReceiptText size={15} /> Personal records stay in your private Google Drive folder.</div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" }) {
  return <Card className="p-4"><p className="text-xs font-extrabold text-muted">{label}</p><p className={`mt-2 truncate text-lg font-extrabold tracking-tight ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p></Card>;
}
