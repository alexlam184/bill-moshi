"use client";

import { ArrowLeft, CheckCircle2, Download, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, PageTitle } from "@/components/ui/primitives";
import type { RestorePreview, RestoreSummary, RestoreWorkspace } from "@/lib/domain/restore";
import { getRestorePreviewSummary } from "@/lib/store/db";

async function requestRestore<T>(body: object): Promise<T> {
  const response = await fetch("/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not read the backup. Please try again.");
  return data as T;
}

export function RestoreScreen() {
  const { snapshot, googleConnected, hydrated, isOnline, syncing, pendingCount, setRestoreMode, restoreGoogleBackup } = useBillMoshi();
  const [workspaces, setWorkspaces] = useState<RestoreWorkspace[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<RestorePreview>();
  const [summary, setSummary] = useState<RestoreSummary>();
  const [result, setResult] = useState<RestoreSummary>();
  const [restoreCurrency, setRestoreCurrency] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sourceEmail, setSourceEmail] = useState("");

  useEffect(() => { setRestoreMode(true); return () => setRestoreMode(false); }, [setRestoreMode]);
  useEffect(() => {
    if (!preview) return;
    let active = true;
    void getRestorePreviewSummary(preview, snapshot, restoreCurrency).then((value) => { if (active) setSummary(value); }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "Could not check local records."); });
    return () => { active = false; };
  }, [preview, restoreCurrency, snapshot, pendingCount]);

  const ready = hydrated && googleConnected && isOnline && !syncing && !busy;
  async function scan() {
    setBusy("Finding backups…"); setError(""); setPreview(undefined); setSummary(undefined); setResult(undefined);
    try {
      const data = await requestRestore<{ accountEmail: string; workspaces: RestoreWorkspace[] }>({ action: "list" });
      setSourceEmail(data.accountEmail); setWorkspaces(data.workspaces); setSelected([]);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not find backups."); }
    finally { setBusy(""); }
  }
  async function loadPreview() {
    setBusy("Reading selected sheets…"); setError(""); setSummary(undefined);
    try { setPreview(await requestRestore<RestorePreview>({ action: "preview", workspaceIds: selected })); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not preview backup."); }
    finally { setBusy(""); }
  }
  async function confirmRestore() {
    if (!preview) return;
    setBusy("Restoring to this device…"); setError("");
    try { setResult(await restoreGoogleBackup(preview, restoreCurrency)); setPreview(undefined); }
    catch (error) { setError(error instanceof Error ? error.message : "Restore failed. Your existing records are safe."); }
    finally { setBusy(""); }
  }

  return <div className="grid min-w-0 gap-5">
    <Link href="/settings" className="flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-brand-dark"><ArrowLeft size={18} /> Settings</Link>
    <PageTitle title="Restore from Google Drive" subtitle="Bring your backed-up records onto this device." />
    <Card className="grid gap-3 p-5 text-sm leading-6">
      <p>Sign in with the Google account that owns your Personal backup or has approved access to your Group.</p>
      <p className="text-muted">Restore adds missing records. Existing records, unsynced changes, edited sample items, and deletions tracked on this device are kept. Unchanged sample items can be replaced by their backed-up versions. Nothing is changed in Google Drive.</p>
      <p className="text-xs text-muted">Receipt and photo links are restored; the files stay in Drive and need internet to open. Old invitation links and activity history are not included.</p>
      {!googleConnected ? <Link href="/login" className="font-bold text-brand-dark underline">Connect Google to restore</Link> : !isOnline ? <p role="status" className="text-warning">Connect to the internet to read your backup.</p> : syncing ? <p role="status">Waiting for the current sync to finish…</p> : <Button type="button" variant="secondary" disabled={!ready} onClick={() => void scan()}><RefreshCw size={17} /> {workspaces ? "Refresh backup list" : "Find my backups"}</Button>}
      {pendingCount > 0 && <p className="text-xs text-warning">{pendingCount} local changes are protected. Automatic sync pauses while this page is open.</p>}
    </Card>
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-brand-dark"><RefreshCw className="animate-spin" size={17} />{busy}</p>}
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm leading-6 text-danger [overflow-wrap:anywhere]">{error}</p>}
    {result ? <Card className="grid gap-3 p-5" ><CheckCircle2 className="text-success" /><h2 className="text-lg font-extrabold">Restore complete</h2><p role="status" className="text-sm leading-6">Restored {result.records} records, {result.groups} new groups, and {result.recurringPayments} new recurring schedules. Used the backup for {result.replacedSample} unchanged sample items. Kept {result.existing} existing items; protected {result.skipped} local changes or deleted items.</p><p className="text-xs leading-5 text-muted">Restored records are saved on this device. Active recurring schedules will catch up on due payments after you leave this page.</p><Link href="/records" className="min-h-11 font-bold text-brand-dark">View records →</Link></Card> : preview ? <>
      <Card className="grid gap-4 p-5">
        <h2 className="text-lg font-extrabold">Review before restoring</h2>
        <p className="text-xs text-muted [overflow-wrap:anywhere]">Google account: {preview.accountEmail}</p>
        {preview.backups.map((backup) => <div key={backup.workspace.id} className="rounded-xl border border-line p-3 text-sm leading-6"><p className="font-bold">{backup.workspace.name}</p><p>{backup.data.records.length} expense / income / transfer records · {backup.data.debtRecords.length} debts · {backup.data.recurringPayments.filter((item) => item.status !== "deleted").length} schedules</p><p className="text-xs text-muted">{backup.skippedRows} invalid rows skipped</p>{backup.warnings.length > 0 && <details className="mt-2 text-xs text-warning"><summary className="cursor-pointer py-2 font-bold">Review skipped rows</summary><ul className="grid gap-1 pl-4">{backup.warnings.map((warning, index) => <li key={index} className="[overflow-wrap:anywhere]">{warning}</li>)}</ul></details>}</div>)}
        {preview.errors.map((message, index) => <p key={index} className="rounded-xl bg-warning-soft p-3 text-sm text-warning [overflow-wrap:anywhere]">{message}</p>)}
        {summary && <div className="rounded-xl bg-brand-soft p-4 text-sm leading-6"><p className="font-bold">{summary.records} restored records · {summary.groups} new groups · {summary.recurringPayments} new schedules</p><p>{summary.existing} existing items will stay unchanged. {summary.replacedSample} unchanged sample items will use the backup version. {summary.skipped} items are protected or have missing parent records.</p></div>}
        {preview.backups.some((backup) => backup.defaultCurrency) && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={restoreCurrency} onChange={(event) => setRestoreCurrency(event.target.checked)} className="size-5 accent-brand" />Also restore my saved default currency ({preview.backups.find((backup) => backup.defaultCurrency)?.defaultCurrency})</label>}
        <p className="text-xs leading-5 text-muted">Confirming saves these records to this device. Active recurring schedules may create any due payments afterward. Existing records are never overwritten, except unchanged built-in sample items.</p>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => { setPreview(undefined); setSummary(undefined); }}>Back to selection</Button><Button type="button" disabled={!ready || !summary || (!summary.added && !restoreCurrency) || !preview.backups.length} onClick={() => void confirmRestore()}><Download size={17} />Confirm restore</Button></div>
      </Card>
    </> : workspaces && <Card className="grid gap-4 p-5">
      <h2 className="font-extrabold">Choose backup sheets</h2><p className="text-xs text-muted [overflow-wrap:anywhere]">{sourceEmail} · Select up to 10 at a time.</p>
      {workspaces.length === 0 && <p className="text-sm leading-6 text-muted">No Bill Moshi Data sheets were found. Check that you signed in with the same Google account and that the original device successfully synced. Legacy combined workbooks are not supported.</p>}
      {workspaces.map((workspace) => <div key={workspace.id} className="min-w-0 rounded-xl border border-line p-3"><label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-brand" checked={selected.includes(workspace.id)} disabled={Boolean(busy) || (!selected.includes(workspace.id) && selected.length >= 10)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, workspace.id] : current.filter((id) => id !== workspace.id))} /><span className="min-w-0 text-sm"><span className="block font-bold [overflow-wrap:anywhere]">{workspace.name}</span><span className="block text-xs text-muted">{workspace.kind === "personal" ? "Personal · Private" : "Group · Access checked before preview"}</span><span className="block text-xs text-muted">Updated {workspace.modifiedAt ? new Date(workspace.modifiedAt).toLocaleString() : "date unavailable"}</span></span></label><a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(workspace.id)}/edit`} target="_blank" rel="noopener noreferrer" className="ml-8 flex min-h-9 items-center gap-1 text-xs font-bold text-brand-dark">Open Data sheet <ExternalLink size={12} /></a></div>)}
      {workspaces.length > 0 && <Button type="button" disabled={!ready || !selected.length} onClick={() => void loadPreview()}>Preview restore ({selected.length})</Button>}
    </Card>}
  </div>;
}
