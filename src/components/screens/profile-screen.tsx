"use client";

import { CalendarDays, ChevronRight, Cloud, CloudOff, Coins, Database, FolderCog, LockKeyhole, LogIn, LogOut, RefreshCw, RotateCcw, Tags, UsersRound, X } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Button, Card, PageTitle } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export function ProfileScreen() {
  const { snapshot, googleConnected, pendingCount, syncing, syncMessage, updateDefaultCurrency, syncNow, resetDemo } = useBillMoshi();
  const [resetOpen, setResetOpen] = useState(false);
  const resetDialogRef = useDialogFocus<HTMLElement>(() => setResetOpen(false), resetOpen);
  return (
    <div className="grid gap-6">
      <PageTitle eyebrow="Account & app" title="Settings" subtitle="Manage your profile, Google storage, categories, and sync." />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={snapshot.currentUser.name} color="#2F80ED" size="lg" />
        <div className="min-w-0 flex-1"><p className="truncate font-extrabold">{snapshot.currentUser.name}</p><p className="truncate text-sm text-muted">{snapshot.currentUser.email}</p></div>
        {googleConnected ? <Button type="button" variant="ghost" className="px-3" aria-label="Sign out" onClick={() => void signOut({ redirectTo: "/login" })}><LogOut size={17} /></Button> : <Link href="/login" className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Sign in"><LogIn size={18} /></Link>}
      </Card>
      <Card className="p-5">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Coins size={21} /></span><div className="min-w-0 flex-1"><h2 className="font-extrabold">Default currency</h2><p className="mt-0.5 text-xs leading-5 text-muted">Personal records are converted to this currency. Groups and Events can use their own currency.</p></div></div>
        <label className="mt-4 grid gap-2 text-sm font-semibold"><span>Personal default</span><select aria-label="Default currency" name="default-currency" autoComplete="off" value={snapshot.currentUser.defaultCurrency} onChange={(event) => updateDefaultCurrency(event.target.value as CurrencyCode)} className="min-h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base font-bold outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft">{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{currencyName(code)}</option>)}</select></label>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line p-5">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${googleConnected ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{googleConnected ? <Cloud size={21} /> : <CloudOff size={21} />}</span>
          <div className="min-w-0 flex-1"><h2 className="font-extrabold">Google Drive & Sheets</h2><p className="mt-0.5 text-xs text-muted">{googleConnected ? "Connected to your Google account" : "Local demo storage only"}</p></div>
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold ${googleConnected ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{googleConnected ? "Connected" : "Not connected"}</span>
        </div>
        <div className="grid gap-3 p-5">
          <div aria-live="polite" role="status" className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <Database size={18} className="mt-0.5 shrink-0 text-brand-dark sm:mt-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold">Sync Status</p>
              <p className="mt-0.5 max-w-full whitespace-normal break-words text-xs leading-5 text-muted [overflow-wrap:anywhere]">{syncMessage}</p>
            </div>
            {pendingCount > 0 && <span className="col-start-2 w-fit shrink-0 whitespace-nowrap rounded-full bg-warning-soft px-2 py-1 text-xs font-extrabold text-warning sm:col-start-auto">{pendingCount} pending</span>}
          </div>
          {googleConnected ? <Button type="button" onClick={() => void syncNow()} disabled={syncing}><RefreshCw className={syncing ? "animate-spin" : ""} size={17} />{syncing ? "Syncing…" : "Sync Now"}</Button> : <Button type="button" onClick={() => void signIn("google", { redirectTo: "/settings" })}><LogIn size={17} /> Connect Google</Button>}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-extrabold">Google Drive layout</h2>
        <p className="mt-1 text-xs leading-5 text-muted">Every ledger has its own Data Sheet and Uploads folder.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5"><LockKeyhole size={19} className="mt-0.5 shrink-0 text-brand-dark" /><div><p className="text-sm font-extrabold">Personal · Private</p><p className="mt-1 text-xs leading-5 text-muted">Owner-only. Bill Moshi never shares the Personal folder.</p></div></div>
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5"><UsersRound size={19} className="mt-0.5 shrink-0 text-brand-dark" /><div><p className="text-sm font-extrabold">Groups · Shareable</p><p className="mt-1 text-xs leading-5 text-muted">A separate folder per Group, shared only with owner-approved members.</p></div></div>
        </div>
      </Card>
      <Card className="divide-y divide-line overflow-hidden">
        <SettingsLink href="/categories" icon={<Tags size={19} />} title="Categories" subtitle="Default and custom categories" />
        <SettingsLink href="/" icon={<FolderCog size={19} />} title="Groups" subtitle="Spaces, members, approvals, and invitations" />
        <SettingsLink href="/events" icon={<CalendarDays size={19} />} title="Events" subtitle="Activities, currencies, and participants" />
      </Card>
      <Card className="p-5"><h2 className="font-extrabold">Demo Tools</h2><p className="mt-1 text-sm leading-6 text-muted">Restore the sample Toronto trip and clear locally queued changes.</p><Button type="button" variant="secondary" className="mt-4" onClick={() => setResetOpen(true)}><RotateCcw size={17} /> Reset Demo Data</Button></Card>
      <p className="text-center text-xs leading-5 text-muted">Bill Moshi requests only basic profile, Drive file, and Sheets permissions needed by the app.</p>
      {resetOpen && <div className="animate-overlay-fade fixed inset-0 z-[80] grid items-end overscroll-contain bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="reset-demo-title"><button type="button" className="absolute inset-0" aria-label="Cancel reset" onClick={() => setResetOpen(false)} /><section ref={resetDialogRef} className="animate-sheet-in safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-danger">Replace Local Data</p><h2 id="reset-demo-title" className="mt-1 text-xl font-extrabold tracking-tight">Reset Demo Data?</h2></div><button type="button" onClick={() => setResetOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close"><X size={20} /></button></div><p className="mt-5 rounded-xl bg-danger-soft p-4 text-sm leading-6 text-ink">This restores the sample Toronto trip and clears locally queued changes. This cannot be undone.</p><div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button><Button type="button" variant="danger" onClick={() => { setResetOpen(false); void resetDemo(); }}><RotateCcw size={16} /> Reset Data</Button></div></section></div>}
    </div>
  );
}

function currencyName(code: CurrencyCode) {
  return `${code} — ${code === "CAD" ? "Canadian Dollar" : code === "HKD" ? "Hong Kong Dollar" : "Japanese Yen"}`;
}

function SettingsLink({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return <Link href={href} className="flex items-center gap-3 p-4 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark">{icon}</span><div className="flex-1"><p className="text-sm font-bold">{title}</p><p className="mt-0.5 text-xs text-muted">{subtitle}</p></div><ChevronRight size={18} className="text-slate-300" /></Link>;
}
