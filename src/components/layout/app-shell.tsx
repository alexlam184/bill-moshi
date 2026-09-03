"use client";

import {
  BarChart3,
  Check,
  ChevronRight,
  FolderPlus,
  House,
  HandCoins,
  Layers3,
  Menu,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/primitives";
import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

const navigation = [
  { href: "/", label: "Overview", icon: House },
  { href: "/records", label: "Records", icon: ReceiptText },
  { href: "/insights", label: "Insight", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function navigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/myself" || pathname.startsWith("/myself/") || pathname === "/calendar" || pathname === "/events" || pathname.startsWith("/groups/") || /^\/events\/[^/]+$/.test(pathname);
  if (href === "/records") return pathname.startsWith("/records");
  if (href === "/insights") return pathname.startsWith("/insights") || pathname.includes("/statistics");
  return pathname.startsWith("/settings") || pathname.startsWith("/profile") || pathname.startsWith("/categories");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { snapshot, selectedGroupId, personalContext, selectGroup, selectPersonal, isOnline, pendingCount, syncing, googleFolderCreationRequired, confirmGoogleFolderCreation, dismissGoogleFolderCreation } = useBillMoshi();
  const [menuOpen, setMenuOpen] = useState(false);
  const groupIdFromPath = pathname.match(/^\/groups\/([^/]+)/)?.[1];
  const eventIdFromPath = pathname.match(/^\/events\/([^/]+)/)?.[1];
  const recordIdFromPath = pathname.match(/^\/records\/(?!new$|mine$|missing-rates$)([^/]+)/)?.[1];
  const selectedRecord = snapshot.records.find((record) => record.id === recordIdFromPath);
  const selectedEvent = snapshot.events.find((event) => event.id === (eventIdFromPath ?? selectedRecord?.eventId));
  const routeGroup = snapshot.groups.find((group) => group.id === (
    groupIdFromPath ?? selectedRecord?.groupId ?? selectedEvent?.groupId
  ));
  const selectedGroup = routeGroup ?? snapshot.groups.find((group) => group.id === selectedGroupId);
  const personalRoute = pathname === "/myself" || pathname.startsWith("/myself/") || pathname.startsWith("/records/mine");
  const personalSelected = Boolean(!routeGroup && (personalRoute || personalContext || (selectedRecord && !selectedRecord.groupId)));
  const debtSelected = pathname.startsWith("/debts");
  const menuPersonalSelected = !debtSelected && (pathname.startsWith("/records/mine") || personalSelected);
  const menuSelectedGroupId = !debtSelected && !menuPersonalSelected && pathname !== "/" ? selectedGroup?.id : undefined;
  const addRecordHref = personalSelected ? "/records/new?personal=1" : selectedGroup ? `/records/new?groupId=${selectedGroup.id}` : "/records/new";
  const overviewHref = personalSelected ? "/myself" : selectedGroup ? `/groups/${selectedGroup.id}` : "/";
  const minimal = pathname.startsWith("/login") || pathname.startsWith("/join/");
  const recordFlow = pathname === "/records/new" || Boolean(recordIdFromPath && /^\/records\/[^/]+(?:\/edit)?$/.test(pathname));
  const debtFlow = pathname === "/debts/new" || /^\/debts\/[^/]+\/edit$/.test(pathname);
  const calendarFlow = pathname === "/calendar" || /^\/groups\/[^/]+\/calendar$/.test(pathname);
  const focusedFlow = recordFlow || debtFlow || calendarFlow;
  const debtNavigation = pathname === "/debts" || pathname.startsWith("/debts/records");

  useEffect(() => {
    if (!routeGroup || routeGroup.id === selectedGroupId) return;
    queueMicrotask(() => selectGroup(routeGroup.id));
  }, [routeGroup, selectGroup, selectedGroupId]);

  if (minimal) return <div key={pathname} className="route-stage min-h-dvh">{children}</div>;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[1180px] bg-white lg:grid lg:grid-cols-[250px_1fr] lg:border-x lg:border-line lg:shadow-2xl">
      <a href="#main-content" className="fixed left-3 top-3 z-[120] -translate-y-24 rounded-xl bg-ink px-4 py-3 text-sm font-extrabold text-white shadow-xl transition-transform focus:translate-y-0">Skip to Main Content</a>
      <aside className="hidden border-r border-line bg-white px-5 py-7 lg:flex lg:flex-col">
        <Brand />
        <nav className="mt-9 grid gap-1.5" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = navigationActive(pathname, href);
            const targetHref = label === "Overview" ? overviewHref : label === "Records" && personalSelected ? "/records/mine" : href;
            return <Link key={href} href={targetHref} className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-sm font-bold transition ${active ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-slate-50 hover:text-ink"}`}><Icon size={19} aria-hidden="true" />{label}</Link>;
          })}
        </nav>

        <div className="mt-7 border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between px-2"><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted">Groups</p><Link href="/groups/new" aria-label="Create group" className="grid size-11 place-items-center rounded-lg text-brand-dark hover:bg-brand-soft"><Plus size={17} /></Link></div>
          <div className="grid gap-1">
            <Link href="/myself" onClick={selectPersonal} className={`flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-sm font-bold ${menuPersonalSelected ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-slate-50"}`}><UserRound size={17} /><span className="min-w-0 flex-1 truncate">Myself</span>{menuPersonalSelected && <Check size={15} />}</Link>
            <Link href="/debts" onClick={() => selectGroup(undefined)} className={`flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-sm font-bold ${debtSelected ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-slate-50"}`}><HandCoins size={17} /><span className="min-w-0 flex-1 truncate">Debt Records</span>{debtSelected && <Check size={15} />}</Link>
            {snapshot.groups.map((group) => <Link key={group.id} href={`/groups/${group.id}`} onClick={() => selectGroup(group.id)} className={`flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-sm font-bold ${menuSelectedGroupId === group.id ? "bg-slate-100 text-ink" : "text-muted hover:bg-slate-50"}`}><span className="text-lg">{group.emoji}</span><span className="min-w-0 flex-1 truncate">{group.name}</span>{menuSelectedGroupId === group.id && <Check size={15} className="text-brand-dark" />}</Link>)}
          </div>
        </div>

        <Link href={addRecordHref} className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-extrabold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-active"><Plus size={19} /> Add Record</Link>
        <div aria-live="polite" className="mt-auto rounded-xl border border-line p-3 text-xs leading-5 text-muted"><span className={`mr-2 inline-block size-2 rounded-full ${isOnline ? "bg-success" : "bg-warning"}`} />{isOnline ? "Online" : "Offline"}{pendingCount > 0 && <span className="block font-semibold text-warning">{pendingCount} waiting to sync</span>}</div>
      </aside>

      <div className="min-w-0">
        {!focusedFlow && <header className="safe-top-header sticky top-0 z-30 grid grid-cols-[44px_1fr_70px] items-center border-b border-line bg-white/95 px-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setMenuOpen(true)} className="motion-press grid size-11 place-items-center rounded-xl text-ink transition-colors hover:bg-slate-100" aria-label="Open group menu"><Menu size={23} /></button>
          <Link href={personalSelected ? "/records/mine" : selectedGroup ? `/groups/${selectedGroup.id}` : "/"} className="flex min-h-11 min-w-0 flex-col items-center justify-center px-2 text-center"><span className="block w-full truncate text-sm font-extrabold tracking-tight">{personalSelected ? "👤 Myself" : selectedGroup ? `${selectedGroup.emoji} ${selectedGroup.name}` : "Bill Moshi"}</span><span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted">{personalSelected ? "Personal expenses" : selectedGroup ? "Current group" : "All groups"}</span></Link>
          <span
            aria-busy={syncing}
            aria-live="polite"
            className={`inline-flex min-w-0 items-center justify-self-end gap-1 rounded-full px-1.5 py-1 text-[0.62rem] font-extrabold ${!isOnline ? "bg-warning-soft text-warning" : syncing ? "bg-brand-soft text-brand-dark" : pendingCount ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
          >
            {syncing && <RefreshCw size={11} className="shrink-0 animate-spin" aria-hidden="true" />}
            <span className="truncate">{!isOnline ? "Offline" : syncing ? "Syncing" : pendingCount ? `${pendingCount} pending` : "Synced"}</span>
          </span>
        </header>}

        <main id="main-content" tabIndex={-1} className={recordFlow || debtFlow ? "mx-auto min-h-dvh w-full p-0 md:max-w-[820px] md:px-8 md:py-8" : calendarFlow ? "mx-auto min-h-dvh w-full p-0 md:max-w-[980px] md:px-8 md:py-8" : "mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-[820px] px-4 pb-28 pt-6 sm:px-7 md:min-h-dvh md:px-10 md:pb-12 md:pt-10"}>
          <div key={pathname} className="route-stage">{children}</div>
        </main>

        {!focusedFlow && (debtNavigation ? <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-[1180px] grid-cols-5 border-t border-line bg-white/95 px-2 pt-2 backdrop-blur lg:hidden" aria-label="Debt records navigation">
          <MobileLink href="/debts" label="Overview" active={pathname === "/debts"} icon={<House size={20} />} />
          <MobileLink href="/debts/records" label="Records" active={pathname.startsWith("/debts/records")} icon={<ReceiptText size={20} />} />
          <Link href="/debts/new" aria-label="Add debt record" className="motion-press mx-auto -mt-5 grid size-14 place-items-center rounded-2xl border-4 border-white bg-brand text-brand-ink shadow-lg"><Plus size={27} strokeWidth={2.6} /></Link>
          <span aria-disabled="true" title="Debt insights are coming soon" className="grid min-h-14 cursor-not-allowed place-items-center content-center gap-1 text-[0.66rem] font-bold text-slate-300"><BarChart3 size={20} aria-hidden="true" />Insight</span>
          <MobileLink href="/settings" label="Settings" active={false} icon={<Settings2 size={20} />} />
        </nav> : <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-[1180px] grid-cols-5 border-t border-line bg-white/95 px-2 pt-2 backdrop-blur lg:hidden" aria-label="Primary navigation">
          {navigation.slice(0, 2).map(({ href, label, icon: Icon }) => <MobileLink key={href} href={label === "Overview" ? overviewHref : label === "Records" && personalSelected ? "/records/mine" : href} label={label} active={navigationActive(pathname, href)} icon={<Icon size={20} />} />)}
          <Link href={addRecordHref} aria-label="Add record" className="motion-press mx-auto -mt-5 grid size-14 place-items-center rounded-2xl border-4 border-white bg-brand text-brand-ink shadow-lg"><Plus size={27} strokeWidth={2.6} /></Link>
          {navigation.slice(2).map(({ href, label, icon: Icon }) => <MobileLink key={href} href={href} label={label} active={navigationActive(pathname, href)} icon={<Icon size={20} />} />)}
        </nav>)}
      </div>

      {menuOpen && <GroupDrawer selectedGroupId={selectedGroup?.id} personalSelected={personalSelected} onClose={() => setMenuOpen(false)} />}
      {googleFolderCreationRequired && <GoogleFolderCreationModal syncing={syncing} onCancel={dismissGoogleFolderCreation} onConfirm={confirmGoogleFolderCreation} />}
    </div>
  );
}

function GoogleFolderCreationModal({ syncing, onCancel, onConfirm }: { syncing: boolean; onCancel(): void; onConfirm(): Promise<void> }) {
  const dialogRef = useDialogFocus<HTMLElement>(onCancel);
  return (
    <div className="animate-overlay-fade fixed inset-0 z-[90] grid items-end overscroll-contain bg-slate-950/45 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="google-folder-title">
      <button type="button" className="absolute inset-0" aria-label="Cancel Google Drive folder creation" onClick={onCancel} />
      <section ref={dialogRef} className="animate-sheet-in safe-bottom relative w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark"><FolderPlus size={21} /></span>
            <div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-brand-dark">Google Drive setup</p><h2 id="google-folder-title" className="mt-1 text-xl font-extrabold tracking-tight">Create “Bill Moshi” folder?</h2></div>
          </div>
          <button type="button" onClick={onCancel} disabled={syncing} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-50" aria-label="Close"><X size={20} /></button>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted">No Bill Moshi app folder was found in this Google Drive. Create one folder now so records and receipts can sync?</p>
        <p className="mt-3 rounded-xl bg-brand-soft/70 p-3 text-xs leading-5 text-ink">Personal data will stay in its private Personal folder. Group folders are created only when needed and can be shared with Group members.</p>
        <div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onCancel} disabled={syncing}>Not Now</Button><Button type="button" onClick={() => void onConfirm()} disabled={syncing}><FolderPlus size={17} /> Create Folder</Button></div>
      </section>
    </div>
  );
}

function GroupDrawer({ selectedGroupId, personalSelected, onClose }: { selectedGroupId?: string; personalSelected: boolean; onClose(): void }) {
  const { snapshot, selectGroup, selectPersonal, isOnline, pendingCount } = useBillMoshi();
  const pathname = usePathname();
  const debtSelected = pathname.startsWith("/debts");
  const myselfSelected = !debtSelected && (pathname.startsWith("/records/mine") || personalSelected);
  const activeGroupId = !debtSelected && !myselfSelected && pathname !== "/" ? selectedGroupId : undefined;
  const allGroupsSelected = !debtSelected && !myselfSelected && !activeGroupId;
  const dialogRef = useDialogFocus<HTMLElement>(onClose);
  return (
    <div className="fixed inset-0 z-50 overscroll-contain lg:hidden" role="dialog" aria-modal="true" aria-label="Select a group">
      <button type="button" className="animate-overlay-fade absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} aria-label="Close group menu" />
      <aside ref={dialogRef} className="animate-drawer-in safe-bottom safe-top relative flex h-full w-[86%] max-w-[340px] flex-col overflow-y-auto overscroll-contain bg-white px-4 py-5 shadow-2xl">
        <div className="flex items-center justify-between px-1"><Brand /><button type="button" onClick={onClose} className="motion-press grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-slate-100" aria-label="Close group menu"><X size={21} /></button></div>
        <div className="mt-7 flex items-center justify-between px-2"><div><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted">Switch group</p><p className="mt-1 text-sm text-muted">Choose where you want to work.</p></div><Layers3 size={20} className="text-brand-dark" /></div>
        <nav className="mt-4 grid gap-1.5" aria-label="Accounts and groups">
          <Link href="/" onClick={() => { selectGroup(undefined); onClose(); }} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 transition ${allGroupsSelected ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-white text-ink hover:bg-slate-50"}`}><span className="grid size-9 place-items-center rounded-xl bg-white text-brand-dark"><House size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">All Groups</span><span className="block truncate text-[0.68rem] font-semibold text-muted">Personal expenses across all groups</span></span>{allGroupsSelected ? <Check size={17} /> : <ChevronRight size={17} />}</Link>
          <Link href="/myself" onClick={() => { selectPersonal(); onClose(); }} className={`mt-1 flex min-h-14 items-center gap-3 rounded-xl border px-3 transition ${myselfSelected ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-white text-ink hover:bg-slate-50"}`}><span className="grid size-9 place-items-center rounded-xl bg-white text-brand-dark"><UserRound size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">Myself</span><span className="block truncate text-[0.68rem] font-semibold text-muted">Personal expenses · No group</span></span>{myselfSelected ? <Check size={17} /> : <ChevronRight size={17} />}</Link>
          <Link href="/debts" onClick={() => { selectGroup(undefined); onClose(); }} className={`mt-1 flex min-h-14 items-center gap-3 rounded-xl border px-3 transition ${debtSelected ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-white text-ink hover:bg-slate-50"}`}><span className="grid size-9 place-items-center rounded-xl bg-white text-brand-dark"><HandCoins size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">Debt Records</span><span className="block truncate text-[0.68rem] font-semibold text-muted">Borrowed & lent · Separate from expenses</span></span>{debtSelected ? <Check size={17} /> : <ChevronRight size={17} />}</Link>
          <div className="my-1 border-t border-line" />
          <p className="px-3 pt-2 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted">Group</p>
          {snapshot.groups.map((group) => <Link key={group.id} href={`/groups/${group.id}`} onClick={() => { selectGroup(group.id); onClose(); }} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 transition ${activeGroupId === group.id ? "border-brand bg-brand-soft text-brand-dark" : "border-transparent text-muted hover:bg-slate-50"}`}><span className="grid size-9 place-items-center rounded-xl bg-white text-xl">{group.emoji}</span><span className="min-w-0 flex-1 truncate text-sm font-extrabold">{group.name}</span>{activeGroupId === group.id ? <Check size={17} /> : <ChevronRight size={17} className="text-slate-300" />}</Link>)}
        </nav>
        <Link href="/groups/new" onClick={onClose} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-brand bg-brand-soft/50 text-sm font-extrabold text-brand-dark"><Plus size={18} /> Create New Group</Link>
        <Link href="/" onClick={() => { selectGroup(undefined); onClose(); }} className="mt-2 flex min-h-11 items-center justify-center text-sm font-bold text-muted hover:text-ink">Manage All Groups</Link>
        <div aria-live="polite" className="mt-auto rounded-xl bg-slate-50 p-3 text-xs text-muted"><span className={`mr-2 inline-block size-2 rounded-full ${isOnline ? "bg-success" : "bg-warning"}`} />{isOnline ? "Online" : "Offline"}{pendingCount > 0 ? ` · ${pendingCount} waiting to sync` : " · Up to date"}</div>
      </aside>
    </div>
  );
}

function MobileLink({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: ReactNode }) {
  return <Link href={href} className={`motion-press grid min-h-14 place-items-center content-center gap-1 text-[0.66rem] font-bold transition-colors ${active ? "text-brand-dark" : "text-muted"}`}><span className={`${active ? "animate-nav-pop text-brand-dark" : "text-slate-400"}`}>{icon}</span>{label}</Link>;
}
