"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Cloud, CloudOff, Code2, Coins, Copy, Database, FolderCog, LoaderCircle, LockKeyhole, LogIn, LogOut, RefreshCw, RotateCcw, Tags, Trash2, UsersRound, X } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Avatar, Button, Card, PageTitle } from "@/components/ui/primitives";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/domain/types";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export function ProfileScreen() {
  const { snapshot, googleConnected, pendingCount, syncing, syncMessage, syncConflicts, updateDefaultCurrency, syncNow, resolveSyncConflict, resetPhoneData, factoryReset, restoreMockRecords } = useBillMoshi();
  const [resetMode, setResetMode] = useState<"phone" | "factory" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [resetProgress, setResetProgress] = useState<"phone" | "factory" | null>(null);
  const [resetSuccess, setResetSuccess] = useState<"phone" | "factory" | null>(null);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [developerPassword, setDeveloperPassword] = useState("");
  const [developerError, setDeveloperError] = useState("");
  const [restoringMock, setRestoringMock] = useState(false);
  const [mockRestoreSuccess, setMockRestoreSuccess] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState<string>();
  const [conflictError, setConflictError] = useState("");
  const [conflictNotice, setConflictNotice] = useState("");
  const resetDialogRef = useDialogFocus<HTMLElement>(() => setResetMode(null), Boolean(resetMode));
  const resetSuccessDialogRef = useDialogFocus<HTMLElement>(() => setResetSuccess(null), Boolean(resetSuccess));
  const developerDialogRef = useDialogFocus<HTMLElement>(() => setDeveloperOpen(false), developerOpen);
  const mockSuccessDialogRef = useDialogFocus<HTMLElement>(() => setMockRestoreSuccess(false), mockRestoreSuccess);
  const closeReset = () => { if (resetting) return; setResetMode(null); setConfirmation(""); setResetError(""); setCopiedPhrase(false); };
  async function copyResetPhrase() {
    try {
      await navigator.clipboard.writeText(resetPhrase);
      setCopiedPhrase(true);
      window.setTimeout(() => setCopiedPhrase(false), 1600);
    } catch {
      setResetError("Could not copy the confirmation text. Please type it manually.");
    }
  }
  const resetPhrase = resetMode === "factory" ? "factory reset" : "reset";
  async function confirmReset() {
    if (!resetMode || confirmation.trim().toLowerCase() !== resetPhrase) return;
    const mode = resetMode;
    setResetting(true); setResetError("");
    setResetProgress(mode);
    try {
      if (mode === "factory") await factoryReset(); else await resetPhoneData();
      setResetMode(null); setConfirmation(""); setResetError("");
      setResetSuccess(mode);
    } catch (error) { setResetError(error instanceof Error ? error.message : "Could not reset data."); }
    finally { setResetProgress(null); setResetting(false); }
  }
  async function confirmDeveloperMode() {
    setRestoringMock(true); setDeveloperError("");
    try {
      const response = await fetch("/api/developer-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: developerPassword }) });
      const result = await response.json() as { authorized?: boolean; error?: string };
      if (!response.ok || !result.authorized) throw new Error(result.error ?? "Developer mode authorization failed.");
      await restoreMockRecords();
      setDeveloperOpen(false); setDeveloperPassword("");
      setMockRestoreSuccess(true);
    } catch (error) { setDeveloperError(error instanceof Error ? error.message : "Could not restore mock records."); }
    finally { setRestoringMock(false); }
  }
  async function resolveConflict(entityId: string, choice: "phone" | "google") {
    setResolvingConflict(entityId); setConflictError(""); setConflictNotice("");
    try {
      const result = await resolveSyncConflict(entityId, choice);
      if (result === "owner-required") setConflictNotice("Phone copy kept on this device. Only the Group owner can sync it over the Google Sheet copy. You can still choose Use Google copy later.");
    }
    catch (error) { setConflictError(error instanceof Error ? error.message : "Could not resolve this conflict."); }
    finally { setResolvingConflict(undefined); }
  }
  return (
    <div className="grid gap-6">
      <PageTitle eyebrow="Account & app" title="Settings" subtitle="Manage your profile, Google storage, categories, and sync." />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={snapshot.currentUser.name} color="var(--color-avatar-brand)" size="lg" />
        <div className="min-w-0 flex-1"><p className="truncate font-extrabold">{snapshot.currentUser.name}</p><p className="truncate text-sm text-muted">{snapshot.currentUser.email}</p></div>
        {googleConnected ? <Button type="button" variant="ghost" className="px-3" aria-label="Sign out" onClick={() => void signOut({ redirectTo: "/login" })}><LogOut size={17} /></Button> : <Link href="/login" className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-dark" aria-label="Sign in"><LogIn size={18} /></Link>}
      </Card>
      {syncConflicts.length > 0 && <Card className="overflow-hidden border-warning/40"><div className="flex items-start gap-3 bg-warning-soft p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-warning"><AlertTriangle size={21} /></span><div><h2 className="font-extrabold">Review sync conflicts</h2><p className="mt-1 text-xs leading-5 text-muted">The same Group record changed on this phone and in Google Sheets. Choose which copy to keep.</p></div></div><div className="divide-y divide-line">{syncConflicts.map((conflict) => { const local = snapshot.records.find((record) => record.id === conflict.entityId); const group = snapshot.groups.find((item) => item.id === conflict.groupId); const owner = snapshot.groupMembers.find((member) => member.groupId === conflict.groupId && member.role === "owner" && member.status === "active"); const isOwner = Boolean(group && (group.ownerId === snapshot.currentUser.id || owner?.userId === snapshot.currentUser.id || owner?.email.toLowerCase() === snapshot.currentUser.email.toLowerCase())); return <div key={conflict.entityId} className="grid gap-3 p-5"><div><p className="font-extrabold">{local?.description ?? conflict.remoteRecord?.description ?? "Deleted record"}</p><p className="mt-1 text-xs leading-5 text-muted">Phone version {conflict.localVersion} · {conflict.reason === "remote-deleted" ? "Deleted from Google Sheets" : `Google Sheet version ${conflict.remoteVersion}`}</p></div><div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" disabled={Boolean(resolvingConflict)} onClick={() => void resolveConflict(conflict.entityId, "google")}>{conflict.remoteRecord ? "Use Google copy" : "Accept deletion"}</Button><Button type="button" disabled={Boolean(resolvingConflict)} onClick={() => void resolveConflict(conflict.entityId, "phone")}>{resolvingConflict === conflict.entityId ? <><LoaderCircle size={16} className="animate-spin" /> Checking…</> : conflict.localAction === "delete" ? "Delete anyway" : "Keep phone copy"}</Button></div>{!isOwner && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-muted">Only the Group owner can replace the Google Sheet copy. Keeping the phone copy leaves this conflict open.</p>}</div>; })}</div>{conflictNotice && <p role="status" className="m-4 rounded-xl bg-warning-soft p-3 text-sm leading-6 text-warning">{conflictNotice}</p>}{conflictError && <p role="alert" className="m-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{conflictError}</p>}</Card>}
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
          <Link href="/settings/restore" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4 text-sm font-bold text-brand-dark"><span>Restore from Google Drive</span><ChevronRight size={18} className="shrink-0" /></Link>
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
      <Card className="grid gap-4 p-5">
        <div><h2 className="font-extrabold">Reset data</h2><p className="mt-1 text-sm leading-6 text-muted">Phone data reset requires <strong>reset</strong>. Factory reset requires <strong>factory reset</strong>.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setResetMode("phone"); setConfirmation(""); setResetError(""); }} className="grid min-h-32 content-start gap-2 rounded-xl border border-line p-4 text-left transition hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning"><RotateCcw size={19} /></span><span className="font-extrabold">Phone data reset</span><span className="text-xs leading-5 text-muted">Deletes all Bill Moshi records, photos, and pending changes on this phone only. Google Drive stays unchanged.</span></button>
          <button type="button" disabled={!googleConnected} onClick={() => { setResetMode("factory"); setConfirmation(""); setResetError(""); }} className="grid min-h-32 content-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/40 p-4 text-left transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"><span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger"><Trash2 size={19} /></span><span className="font-extrabold text-danger">Factory reset</span><span className="text-xs leading-5 text-muted">Deletes this phone’s data and moves Bill Moshi Google Drive storage to Trash.</span></button>
        </div>
        {!googleConnected && <p className="text-xs text-muted">Connect Google to enable Factory reset.</p>}
      </Card>
      {process.env.NODE_ENV !== "production" && <Card className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0"><h2 className="font-extrabold">Developer mode</h2><p className="mt-1 text-sm leading-6 text-muted">Restore all local mock records for testing.</p></div>
        <Button type="button" variant="secondary" onClick={() => { setDeveloperOpen(true); setDeveloperPassword(""); setDeveloperError(""); }}><Code2 size={17} /> Open</Button>
      </Card>}
      <p className="text-center text-xs leading-5 text-muted">Bill Moshi requests only basic profile, Drive file, and Sheets permissions needed by the app.</p>
      {resetMode && <div className="animate-overlay-fade fixed inset-0 z-[80] grid items-end overscroll-contain bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="reset-title"><button type="button" className="absolute inset-0" aria-label="Cancel reset" onClick={closeReset} /><section ref={resetDialogRef} className="animate-sheet-in safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-danger">Reset confirmation</p><h2 id="reset-title" className="mt-1 text-xl font-extrabold tracking-tight">{resetMode === "factory" ? "Factory reset Bill Moshi?" : "Reset phone data?"}</h2></div><button type="button" onClick={closeReset} disabled={resetting} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-50" aria-label="Close"><X size={20} /></button></div><p className="mt-5 rounded-xl bg-danger-soft p-4 text-sm leading-6 text-ink">{resetMode === "factory" ? "This deletes all Bill Moshi data on this phone and moves the app’s Google Drive folder, sheets, and uploads to Trash. Shared files owned by another person can remain in their Drive." : "This permanently deletes all Bill Moshi data, photos, and queued changes from this phone. Your Google Drive backup stays unchanged."}</p><div className="mt-5 flex items-center gap-1.5 text-sm font-bold">Type <span className="relative inline-flex"><button type="button" onClick={() => void copyResetPhrase()} className="inline-flex min-h-11 items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-2 font-mono text-xs font-extrabold text-danger transition hover:bg-danger-soft focus:outline-none focus:ring-4 focus:ring-danger-soft" aria-label={`Copy ${resetPhrase}`}><span>{resetPhrase}</span><Copy size={13} /></button>{copiedPhrase && <span role="status" className="animate-fade-in absolute bottom-[calc(100%+0.4rem)] left-1/2 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-extrabold text-white shadow-lg">Copied</span>}</span> to confirm</div><input data-dialog-initial-focus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-line px-3.5 text-base font-normal outline-none focus:border-brand" placeholder={`${resetPhrase}…`} aria-label="Reset confirmation phrase" name="reset-confirmation" autoComplete="off" />{resetError && <p role="alert" className="mt-3 break-words rounded-xl bg-danger-soft p-3 text-sm text-danger">{resetError}</p>}<div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" disabled={resetting} onClick={closeReset}>Cancel</Button><Button type="button" variant="danger" disabled={resetting || confirmation.trim().toLowerCase() !== resetPhrase} onClick={() => void confirmReset()}>{resetting ? "Resetting…" : <><Trash2 size={16} /> Reset</>}</Button></div></section></div>}
      {typeof document !== "undefined" && resetProgress && createPortal(<div className="animate-overlay-fade fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 px-5 backdrop-blur-[2px]" role="status" aria-live="assertive"><section className="animate-sheet-in w-full max-w-xs rounded-[1.75rem] bg-white p-7 text-center shadow-2xl"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger"><LoaderCircle size={28} className="animate-spin" /></span><h2 className="mt-5 text-xl font-extrabold">{resetProgress === "factory" ? "Factory reset in progress" : "Deleting phone data"}</h2><p className="mt-2 text-sm leading-6 text-muted">{resetProgress === "factory" ? "Removing phone data and clearing Bill Moshi storage from Google Drive…" : "Removing Bill Moshi data from this phone…"}</p></section></div>, document.body)}
      {typeof document !== "undefined" && resetSuccess && createPortal(<div className="animate-overlay-fade fixed inset-0 z-[90] grid place-items-center overscroll-contain bg-slate-950/45 px-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="reset-success-title"><section ref={resetSuccessDialogRef} className="animate-sheet-in w-full max-w-xs rounded-[1.75rem] bg-white p-7 text-center shadow-2xl"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success"><CheckCircle2 size={30} /></span><h2 id="reset-success-title" className="mt-5 text-xl font-extrabold">{resetSuccess === "factory" ? "Factory reset complete" : "Phone data reset complete"}</h2><p className="mt-2 text-sm leading-6 text-muted">{resetSuccess === "factory" ? "Your phone is clear and Bill Moshi Google Drive storage was moved to Trash." : "This phone is now ready for a fresh Bill Moshi start."}</p><Button type="button" className="mt-6 w-full" onClick={() => setResetSuccess(null)}>Done</Button></section></div>, document.body)}
      {typeof document !== "undefined" && developerOpen && createPortal(<div className="animate-overlay-fade fixed inset-0 z-[90] grid place-items-center overscroll-contain bg-slate-950/45 px-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="developer-title"><button type="button" className="absolute inset-0" aria-label="Close developer mode" disabled={restoringMock} onClick={() => setDeveloperOpen(false)} /><section ref={developerDialogRef} className="animate-sheet-in relative w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-brand-dark">Developer mode</p><h2 id="developer-title" className="mt-1 text-xl font-extrabold tracking-tight">Restore mock records</h2></div><button type="button" disabled={restoringMock} onClick={() => setDeveloperOpen(false)} className="grid size-11 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 disabled:opacity-50" aria-label="Close"><X size={20} /></button></div><p className="mt-5 rounded-xl bg-warning-soft p-4 text-sm leading-6 text-ink">This replaces the data saved on this phone with all Bill Moshi mock records. It does not change Google Drive.</p><label className="mt-5 grid gap-2 text-sm font-bold">Developer password<input data-dialog-initial-focus type="password" value={developerPassword} onChange={(event) => setDeveloperPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void confirmDeveloperMode(); }} className="min-h-12 rounded-xl border border-line px-3.5 text-base font-normal outline-none focus:border-brand" name="developer-password" autoComplete="off" /></label>{developerError && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{developerError}</p>}<div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" disabled={restoringMock} onClick={() => setDeveloperOpen(false)}>Cancel</Button><Button type="button" disabled={restoringMock || !developerPassword} onClick={() => void confirmDeveloperMode()}>{restoringMock ? <><LoaderCircle size={16} className="animate-spin" /> Restoring…</> : "Restore records"}</Button></div></section></div>, document.body)}
      {typeof document !== "undefined" && mockRestoreSuccess && createPortal(<div className="animate-overlay-fade fixed inset-0 z-[90] grid place-items-center overscroll-contain bg-slate-950/45 px-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="mock-success-title"><section ref={mockSuccessDialogRef} className="animate-sheet-in w-full max-w-xs rounded-[1.75rem] bg-white p-7 text-center shadow-2xl"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success"><CheckCircle2 size={30} /></span><h2 id="mock-success-title" className="mt-5 text-xl font-extrabold">Mock records restored</h2><p className="mt-2 text-sm leading-6 text-muted">Developer mode is ready with the complete Bill Moshi demo data.</p><Button type="button" className="mt-6 w-full" onClick={() => setMockRestoreSuccess(false)}>Done</Button></section></div>, document.body)}
    </div>
  );
}

function currencyName(code: CurrencyCode) {
  return `${code} — ${code === "CAD" ? "Canadian Dollar" : code === "HKD" ? "Hong Kong Dollar" : "Japanese Yen"}`;
}

function SettingsLink({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return <Link href={href} className="flex items-center gap-3 p-4 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-dark">{icon}</span><div className="flex-1"><p className="text-sm font-bold">{title}</p><p className="mt-0.5 text-xs text-muted">{subtitle}</p></div><ChevronRight size={18} className="text-slate-300" /></Link>;
}
