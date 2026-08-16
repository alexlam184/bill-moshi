"use client";

import { CalendarDays, ChevronRight, Cloud, CloudOff, Coins, Database, FolderCog, LockKeyhole, LogIn, LogOut, RefreshCw, RotateCcw, Tags, UsersRound } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Button, Card, PageTitle } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";

export function ProfileScreen() {
  const { snapshot, googleConnected, pendingCount, syncing, syncMessage, updateDefaultCurrency, syncNow, resetDemo } = useBillMoshi();
  return (
    <div className="grid gap-6 animate-rise">
      <PageTitle eyebrow="Account & app" title="Settings" subtitle="Manage your profile, Google storage, categories, and sync." />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={snapshot.currentUser.name} color="#2F80ED" size="lg" />
        <div className="min-w-0 flex-1"><p className="truncate font-extrabold">{snapshot.currentUser.name}</p><p className="truncate text-sm text-muted">{snapshot.currentUser.email}</p></div>
        {googleConnected ? <Button type="button" variant="ghost" className="px-3" onClick={() => void signOut({ redirectTo: "/login" })}><LogOut size={17} /></Button> : <Link href="/login" className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Sign in"><LogIn size={18} /></Link>}
      </Card>
      <Card className="p-5">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark"><Coins size={21} /></span><div className="min-w-0 flex-1"><h2 className="font-extrabold">Default currency</h2><p className="mt-0.5 text-xs leading-5 text-muted">Personal records are converted to this currency. Groups and Events can use their own currency.</p></div></div>
        <label className="mt-4 grid gap-2 text-sm font-semibold"><span>Personal default</span><select aria-label="Default currency" value={snapshot.currentUser.defaultCurrency} onChange={(event) => updateDefaultCurrency(event.target.value as CurrencyCode)} className="min-h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base font-bold outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft">{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{currencyName(code)}</option>)}</select></label>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line p-5"><span className={`grid size-11 place-items-center rounded-xl ${googleConnected ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{googleConnected ? <Cloud size={21} /> : <CloudOff size={21} />}</span><div className="min-w-0 flex-1"><h2 className="font-extrabold">Google Drive & Sheets</h2><p className="mt-0.5 text-xs text-muted">{googleConnected ? "Connected to your Google account" : "Local demo storage only"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${googleConnected ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{googleConnected ? "Connected" : "Not connected"}</span></div>
        <div className="grid gap-3 p-5"><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Database size={18} className="text-brand-dark" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">Sync status</p><p className="truncate text-xs text-muted">{syncMessage}</p></div>{pendingCount > 0 && <span className="text-xs font-extrabold text-warning">{pendingCount} pending</span>}</div>{googleConnected ? <Button type="button" onClick={() => void syncNow()} disabled={syncing}><RefreshCw className={syncing ? "animate-spin" : ""} size={17} />{syncing ? "Syncing…" : "Sync now"}</Button> : <Button type="button" onClick={() => void signIn("google", { redirectTo: "/settings" })}><LogIn size={17} /> Connect Google</Button>}</div>
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
      <Card className="p-5"><h2 className="font-extrabold">Demo tools</h2><p className="mt-1 text-sm leading-6 text-muted">Restore the sample Toronto trip and clear locally queued changes.</p><Button type="button" variant="secondary" className="mt-4" onClick={() => void resetDemo()}><RotateCcw size={17} /> Reset demo data</Button></Card>
      <p className="text-center text-xs leading-5 text-muted">Bill Moshi requests only basic profile, Drive file, and Sheets permissions needed by the app.</p>
    </div>
  );
}

function currencyName(code: CurrencyCode) {
  return `${code} — ${code === "CAD" ? "Canadian Dollar" : code === "HKD" ? "Hong Kong Dollar" : "Japanese Yen"}`;
}

function SettingsLink({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return <Link href={href} className="flex items-center gap-3 p-4 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark">{icon}</span><div className="flex-1"><p className="text-sm font-bold">{title}</p><p className="mt-0.5 text-xs text-muted">{subtitle}</p></div><ChevronRight size={18} className="text-slate-300" /></Link>;
}
