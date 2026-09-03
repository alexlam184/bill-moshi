"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { allocateSplits, roundMoney, type SplitInput } from "@/lib/domain/calculations";
import { emptySnapshot } from "@/lib/domain/empty-snapshot";
import { createClientId } from "@/lib/domain/client-id";
import { deleteGroupData, leaveGroupData, removeDeletedGroups } from "@/lib/domain/group-lifecycle";
import { bindSnapshotIdentity } from "@/lib/domain/identity";
import { seedSnapshot } from "@/lib/domain/seed";
import { recordSyncFingerprint } from "@/lib/domain/sync-conflicts";
import type { RemoteGroupState } from "@/lib/integrations/google/contracts";
import { useRecurringPayments } from "@/lib/hooks/use-recurring-payments";
import type { RestorePreview, RestoreSummary } from "@/lib/domain/restore";
import type {
  AppSnapshot,
  BillEvent,
  CurrencyCode,
  DebtDirection,
  DebtRecord,
  DebtStatus,
  EventMember,
  LedgerRecord,
  RecordSyncConflict,
  Group,
  GroupInvitation,
  GroupInvitationPreview,
  GroupMember,
  JoinRequest,
  MemberRole,
  PendingOperation,
  RecordType,
  RecurringPaymentInput,
  Settlement,
  SplitMethod,
} from "@/lib/domain/types";
import {
  clearLocalData,
  getReceipt,
  listPendingOperations,
  loadSnapshot,
  queueOperation,
  removePendingOperations,
  saveReceipt,
  saveSnapshot,
  updatePendingOperation,
  restoreFromPreview,
} from "@/lib/store/db";

type CreateGroupInput = Pick<Group, "name" | "emoji" | "description" | "currency">;
type CreateEventInput = Pick<BillEvent, "groupId" | "name" | "emoji" | "baseCurrency" | "startDate" | "endDate">;
type UpdateEventInput = Omit<CreateEventInput, "groupId">;

export interface AddRecordInput {
  recordType: RecordType;
  groupId?: string;
  eventId?: string;
  description: string;
  categoryId: string;
  transactionDate: string;
  payerId: string;
  amountOriginal: number;
  currencyOriginal: CurrencyCode;
  exchangeRate: number;
  baseCurrency?: CurrencyCode;
  exchangeRateDate?: string;
  exchangeRateSource?: LedgerRecord["exchangeRateSource"];
  exchangeRateProvider?: string;
  reportingCurrency?: CurrencyCode;
  baseToReportingRate?: number;
  reportingRateSource?: LedgerRecord["reportingRateSource"];
  reportingRateDate?: string;
  reportingRateProvider?: string;
  splitMethod: SplitMethod;
  splitInputs: SplitInput[];
  notes?: string;
  receipt?: File;
}

export interface RecordSettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  scope: Settlement["scope"];
  paymentMethod: string;
  note?: string;
  events: Array<{ eventId: string; allocatedAmount: number }>;
}

export interface AddDebtRecordInput {
  direction: DebtDirection;
  personName: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  dueDate?: string;
  note?: string;
}

interface AppContextValue {
  setRestoreMode(active: boolean): void;
  restoreGoogleBackup(preview: RestorePreview, restoreCurrency?: boolean): Promise<RestoreSummary>;
  saveRecurringPayment(input: RecurringPaymentInput, paymentId?: string): Promise<string>;
  changeRecurringPayment(paymentId: string, action: "pause" | "resume" | "skip" | "delete"): Promise<void>;
  recurringError: string;
  snapshot: AppSnapshot;
  selectedGroupId?: string;
  personalContext: boolean;
  hydrated: boolean;
  isOnline: boolean;
  googleConnected: boolean;
  pendingCount: number;
  syncing: boolean;
  syncMessage: string;
  syncConflicts: RecordSyncConflict[];
  googleFolderCreationRequired: boolean;
  lastSyncAt?: string;
  selectGroup(groupId?: string): void;
  selectPersonal(): void;
  updateDefaultCurrency(currency: CurrencyCode): void;
  createGroup(input: CreateGroupInput): string;
  updateGroupCurrency(groupId: string, currency: CurrencyCode): void;
  updateGroupNotes(groupId: string, notes: string): void;
  leaveGroup(groupId: string): void;
  deleteGroup(groupId: string): void;
  createEvent(input: CreateEventInput): string;
  updateEvent(eventId: string, input: Partial<UpdateEventInput>): void;
  deleteEvent(eventId: string): void;
  addRecord(input: AddRecordInput): Promise<string>;
  updateRecord(recordId: string, input: AddRecordInput): Promise<void>;
  setRecordReportingRate(recordId: string, rate: number): void;
  deleteRecord(recordId: string): void;
  addDebtRecords(inputs: AddDebtRecordInput[], photos?: File[]): Promise<string[]>;
  updateDebtRecord(debtRecordId: string, input: AddDebtRecordInput, photos?: File[]): Promise<void>;
  updateDebtRecordStatus(debtRecordId: string, status: DebtStatus): void;
  addCategory(name: string, emoji: string): string;
  recordSettlement(input: RecordSettlementInput): string;
  createInvitation(groupId: string, input?: Partial<Pick<GroupInvitation, "approvalRequired" | "defaultRole" | "expiresAt" | "maxUses">>): Promise<string>;
  revokeInvitation(invitationId: string): Promise<void>;
  resolveInvitation(token: string): Promise<GroupInvitationPreview | undefined>;
  requestJoin(token: string): Promise<"created" | "duplicate" | "invalid" | "approved">;
  refreshJoinRequests(groupId: string): Promise<void>;
  reviewJoinRequest(requestId: string, decision: "approved" | "rejected", role?: Exclude<MemberRole, "owner">): Promise<void>;
  syncNow(options?: { allowGoogleFolderCreation?: boolean }): Promise<void>;
  confirmGoogleFolderCreation(): Promise<void>;
  dismissGoogleFolderCreation(): void;
  resolveSyncConflict(entityId: string, choice: "phone" | "google"): Promise<"resolved" | "owner-required">;
  dismissGroupDeletionNotice(groupId: string): void;
  resetPhoneData(): Promise<void>;
  factoryReset(): Promise<void>;
  restoreMockRecords(): Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);
const SELECTED_CONTEXT_KEY = "bill-moshi-records-selected-group";
const PERSONAL_CONTEXT_VALUE = "myself";
const GOOGLE_FOLDER_CREATION_REQUIRED = "GOOGLE_ROOT_FOLDER_CREATION_REQUIRED";

class GoogleFolderCreationRequiredError extends Error {
  constructor() {
    super("Google Drive folder creation needs confirmation.");
    this.name = "GoogleFolderCreationRequiredError";
  }
}

function id(prefix: string) {
  return createClientId(prefix);
}


function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function collaborationRequest<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Collaboration request failed.");
  return result;
}

function mergeRemoteById<T extends { id: string }>(local: T[], remote: T[], protectedIds: ReadonlySet<string>) {
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  return [
    ...local.map((item) => protectedIds.has(item.id) ? item : remoteById.get(item.id) ?? item),
    ...remote.filter((item) => !local.some((existing) => existing.id === item.id)),
  ];
}

function groupMemberToEventMember(groupMember: GroupMember, eventId: string): EventMember {
  return {
    id: id("member"),
    eventId,
    userId: groupMember.userId,
    name: groupMember.name,
    email: groupMember.email,
    role: groupMember.role,
    status: groupMember.status,
    joinedAt: groupMember.joinedAt,
    avatarColor: groupMember.avatarColor,
  };
}


export function BillMoshiProvider({ children }: { children: ReactNode }) {
  const [startupMessage, setStartupMessage] = useState("Preparing your device…");
  const { data: session, status } = useSession();
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => emptySnapshot());
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [personalContext, setPersonalContext] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [autoSyncPaused, setAutoSyncPaused] = useState(false);
  const [restoreMode, setRestoreModeState] = useState(false);
  const restoreModeRef = useRef(false);
  const setRestoreMode = useCallback((active: boolean) => { restoreModeRef.current = active; setRestoreModeState(active); }, []);
  const syncInFlightRef = useRef(false);
  const quotaBackoffUntilRef = useRef(0);
  const quotaBackoffAttemptRef = useRef(0);
  const quotaRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialSharedPullRef = useRef(false);
  const [syncMessage, setSyncMessage] = useState("Saved on this device");
  const [syncConflicts, setSyncConflicts] = useState<RecordSyncConflict[]>([]);
  const [googleFolderCreationRequired, setGoogleFolderCreationRequired] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>();
  const googleConnected = status === "authenticated" && Boolean(session?.googleConnected);

  const refreshPending = useCallback(async () => {
    setPendingCount((await listPendingOperations()).length);
  }, []);

  const { saveRecurringPayment, changeRecurringPayment, recurringError } = useRecurringPayments(snapshot, setSnapshot, hydrated && status !== "loading" && !restoreMode, refreshPending);

  const restoreGoogleBackup = useCallback(async (preview: RestorePreview, restoreCurrency = false) => {
    if (!hydrated || !googleConnected || !restoreModeRef.current) throw new Error("Open Restore from Google Drive while signed in to your Google account.");
    if (syncInFlightRef.current) throw new Error("Wait for the current sync to finish, then restore again.");
    if (preview.accountEmail.toLowerCase() !== session?.user?.email?.toLowerCase()) throw new Error("Your Google account changed. Load a new preview.");
    await saveSnapshot(snapshot);
    const result = await restoreFromPreview(preview, snapshot, restoreCurrency);
    setSnapshot(result.snapshot);
    await refreshPending();
    setSyncMessage(`Restored ${result.summary.records} records from Google Drive`);
    return result.summary;
  }, [googleConnected, hydrated, refreshPending, session?.user?.email, snapshot]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await loadSnapshot(() => {
        if (active) setStartupMessage("Close other Bill Moshi tabs and app windows to finish clearing the old phone data.");
      });
      if (!active) return;
      const nextSnapshot = saved ?? emptySnapshot();
      localStorage.removeItem("bill-moshi-selected-group");
      setSnapshot(nextSnapshot);
      const storedContext = localStorage.getItem(SELECTED_CONTEXT_KEY) ?? undefined;
      setPersonalContext(storedContext === PERSONAL_CONTEXT_VALUE);
      setSelectedGroupId(nextSnapshot.groups.some((group) => group.id === storedContext) ? storedContext : undefined);
      setIsOnline(navigator.onLine);
      await refreshPending();
      setHydrated(true);
    })().catch((error: unknown) => {
      if (active) setStartupMessage(error instanceof Error ? error.message : "Device storage could not be opened. Reopen the app to try again.");
    });
    return () => {
      active = false;
    };
  }, [refreshPending]);

  const selectGroup = useCallback((groupId?: string) => {
    if (groupId && !snapshot.groups.some((group) => group.id === groupId)) return;
    setPersonalContext(false);
    setSelectedGroupId(groupId);
    if (groupId) localStorage.setItem(SELECTED_CONTEXT_KEY, groupId);
    else localStorage.removeItem(SELECTED_CONTEXT_KEY);
  }, [snapshot.groups]);

  const selectPersonal = useCallback(() => {
    setSelectedGroupId(undefined);
    setPersonalContext(true);
    localStorage.setItem(SELECTED_CONTEXT_KEY, PERSONAL_CONTEXT_VALUE);
  }, []);

  const dismissGroupDeletionNotice = useCallback((groupId: string) => {
    setSnapshot((current) => ({ ...current, groupDeletionNotices: current.groupDeletionNotices.filter((notice) => notice.groupId !== groupId) }));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveSnapshot(snapshot);
  }, [hydrated, snapshot]);

  useEffect(() => {
    if (!hydrated || status !== "authenticated" || !session?.user?.email) return;
    const email = session.user.email;
    const name = session.user.name || email.split("@")[0];
    const image = session.user.image ?? undefined;
    const googleUserId = `google:${email.toLowerCase()}`;
    queueMicrotask(() => setSnapshot((current) => {
      const sourceUserId = !current.currentUser.id.startsWith("google:")
        ? current.currentUser.id
        : current.groups.some((group) => group.ownerId === seedSnapshot.currentUser.id)
          ? seedSnapshot.currentUser.id
          : undefined;
      return bindSnapshotIdentity(current, { id: googleUserId, name, email, image }, sourceUserId);
    }));
  }, [hydrated, session?.user?.email, session?.user?.image, session?.user?.name, status]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => () => {
    if (quotaRetryTimerRef.current) clearTimeout(quotaRetryTimerRef.current);
  }, []);

  const enqueue = useCallback(async (operation: Omit<PendingOperation, "id" | "createdAt" | "attempts" | "status" | "idempotencyKey">) => {
    const operationId = id("operation");
    await queueOperation({
      ...operation,
      id: operationId,
      idempotencyKey: operationId,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: "pending",
    });
    setAutoSyncPaused(false);
    await refreshPending();
  }, [refreshPending]);

  const createGroup = useCallback((input: CreateGroupInput) => {
    const groupId = id("group");
    const timestamp = new Date().toISOString();
    const group: Group = {
      id: groupId,
      name: input.name.trim(),
      emoji: input.emoji || "👥",
      description: input.description?.trim() || undefined,
      currency: input.currency,
      ownerId: snapshot.currentUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const groupMember: GroupMember = {
      id: id("group-member"),
      groupId,
      userId: snapshot.currentUser.id,
      name: snapshot.currentUser.name,
      email: snapshot.currentUser.email,
      role: "owner",
      status: "active",
      joinedAt: timestamp,
      avatarColor: "var(--color-avatar-brand)",
    };
    setSnapshot((current) => ({
      ...current,
      groups: [group, ...current.groups],
      groupMembers: [groupMember, ...current.groupMembers],
      activity: [{ id: id("activity"), groupId, actorId: current.currentUser.id, type: "group_created", title: `${group.emoji} ${group.name} created`, detail: "Ready for its first event", createdAt: timestamp }, ...current.activity],
    }));
    setPersonalContext(false);
    setSelectedGroupId(groupId);
    localStorage.setItem(SELECTED_CONTEXT_KEY, groupId);
    void enqueue({ entityType: "group", entityId: groupId, action: "upsert", payload: { group, groupMember } });
    return groupId;
  }, [enqueue, snapshot.currentUser]);

  const updateDefaultCurrency = useCallback((currency: CurrencyCode) => {
    const updatedAt = new Date().toISOString();
    setSnapshot((current) => ({ ...current, currentUser: { ...current.currentUser, defaultCurrency: currency } }));
    void enqueue({
      entityType: "user_settings",
      entityId: snapshot.currentUser.id,
      action: "upsert",
      payload: { settings: { userId: snapshot.currentUser.id, email: snapshot.currentUser.email, defaultCurrency: currency, updatedAt } },
    });
  }, [enqueue, snapshot.currentUser.email, snapshot.currentUser.id]);

  const updateGroupCurrency = useCallback((groupId: string, currency: CurrencyCode) => {
    const currentGroup = snapshot.groups.find((group) => group.id === groupId);
    if (!currentGroup) return;
    if (currentGroup.ownerId !== snapshot.currentUser.id) throw new Error("Only the group owner can change the Group currency.");
    const updated: Group = { ...currentGroup, currency, updatedAt: new Date().toISOString() };
    setSnapshot((current) => ({ ...current, groups: current.groups.map((group) => group.id === groupId ? updated : group) }));
    void enqueue({ entityType: "group", entityId: groupId, action: "upsert", payload: { group: updated } });
  }, [enqueue, snapshot.currentUser.id, snapshot.groups]);

  const updateGroupNotes = useCallback((groupId: string, notes: string) => {
    const currentGroup = snapshot.groups.find((group) => group.id === groupId);
    if (!currentGroup) return;
    const updated: Group = {
      ...currentGroup,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    setSnapshot((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? updated : group),
    }));
    void enqueue({ entityType: "group", entityId: groupId, action: "upsert", payload: { group: updated } });
  }, [enqueue, snapshot.groups]);

  const leaveGroup = useCallback((groupId: string) => {
    const result = leaveGroupData(snapshot, groupId, snapshot.currentUser.id);
    setSnapshot(result.snapshot);
    if (localStorage.getItem(SELECTED_CONTEXT_KEY) === groupId) localStorage.removeItem(SELECTED_CONTEXT_KEY);
    setSelectedGroupId(undefined);
    setPersonalContext(false);
    void enqueue({
      entityType: "group_member",
      entityId: result.groupMember.id,
      action: "upsert",
      payload: { groupMember: result.groupMember, eventMembers: result.eventMembers },
    });
  }, [enqueue, snapshot]);

  const deleteGroup = useCallback((groupId: string) => {
    const group = snapshot.groups.find((item) => item.id === groupId);
    const nextSnapshot = deleteGroupData(snapshot, groupId, snapshot.currentUser.id);
    setSnapshot(nextSnapshot);
    if (localStorage.getItem(SELECTED_CONTEXT_KEY) === groupId) localStorage.removeItem(SELECTED_CONTEXT_KEY);
    setSelectedGroupId(undefined);
    setPersonalContext(false);
    void enqueue({
      entityType: "group",
      entityId: groupId,
      action: "delete",
      payload: { groupId, groupName: group?.name, requestedBy: snapshot.currentUser.id },
    });
  }, [enqueue, snapshot]);

  const createEvent = useCallback((input: CreateEventInput) => {
    if (!snapshot.groups.some((group) => group.id === input.groupId)) {
      throw new Error("Choose a valid group for this event.");
    }
    const eventId = id("event");
    const timestamp = new Date().toISOString();
    const event: BillEvent = {
      id: eventId,
      groupId: input.groupId,
      name: input.name.trim(),
      emoji: input.emoji || "🧳",
      startDate: input.startDate,
      endDate: input.endDate,
      baseCurrency: input.baseCurrency,
      ownerId: snapshot.currentUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      simplifyDebts: true,
    };
    const groupMembers = snapshot.groupMembers.filter((member) => member.groupId === input.groupId && member.status === "active");
    const members = groupMembers.map((member) => groupMemberToEventMember(member, eventId));
    setSnapshot((current) => ({
      ...current,
      events: [event, ...current.events],
      members: [...members, ...current.members],
      activity: [{ id: id("activity"), groupId: event.groupId, eventId, actorId: current.currentUser.id, type: "event_created", title: `${event.emoji} ${event.name} created`, detail: `Base currency: ${event.baseCurrency}`, createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "event", entityId: eventId, action: "upsert", payload: { event, members } });
    return eventId;
  }, [enqueue, snapshot.currentUser.id, snapshot.groupMembers, snapshot.groups]);

  const updateEvent = useCallback((eventId: string, input: Partial<UpdateEventInput>) => {
    const timestamp = new Date().toISOString();
    const event = snapshot.events.find((item) => item.id === eventId);
    if (!event) return;
    const updated = { ...event, ...input, name: input.name?.trim() || event.name, updatedAt: timestamp };
    const members = snapshot.members.filter((item) => item.eventId === eventId);
    setSnapshot((current) => ({ ...current, events: current.events.map((item) => item.id === eventId ? updated : item) }));
    void enqueue({ entityType: "event", entityId: eventId, action: "upsert", payload: { event: updated, members } });
  }, [enqueue, snapshot.events, snapshot.members]);

  const deleteEvent = useCallback((eventId: string) => {
    const groupId = snapshot.events.find((event) => event.id === eventId)?.groupId;
    if (!groupId) return;
    setSnapshot((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== eventId),
      members: current.members.filter((member) => member.eventId !== eventId),
      records: current.records.filter((record) => record.eventId !== eventId),
    }));
    void enqueue({ entityType: "event", entityId: eventId, action: "delete", payload: { eventId, groupId } });
  }, [enqueue, snapshot.events]);

  const addRecord = useCallback(async (input: AddRecordInput) => {
    const group = snapshot.groups.find((item) => item.id === input.groupId);
    const event = input.eventId
      ? snapshot.events.find((item) => item.id === input.eventId && item.groupId === input.groupId)
      : undefined;
    if (input.groupId && !group) throw new Error("Group not found.");
    if (!input.groupId && input.eventId) throw new Error("A personal record cannot belong to an event.");
    if (input.eventId && !event) throw new Error("Choose an event from this group.");
    if (input.recordType === "transfer" && !input.groupId) throw new Error("Choose a group to transfer money between members.");
    if (input.recordType === "transfer" && (input.splitInputs.length !== 1 || input.splitInputs[0].memberId === input.payerId)) {
      throw new Error("Choose one different member to receive the transfer.");
    }
    if (!input.groupId && (input.payerId !== snapshot.currentUser.id || input.splitInputs.some((split) => split.memberId !== snapshot.currentUser.id))) {
      throw new Error("Personal records can only be assigned to you.");
    }
    const recordId = id("record");
    const timestamp = new Date().toISOString();
    const baseCurrency = input.baseCurrency ?? event?.baseCurrency ?? group?.currency ?? snapshot.currentUser.defaultCurrency;
    const converted = input.currencyOriginal !== baseCurrency;
    const exchangeRate = converted ? input.exchangeRate : 1;
    const amountBase = roundMoney(input.amountOriginal * exchangeRate, baseCurrency);
    const reportingCurrency = input.reportingCurrency ?? snapshot.currentUser.defaultCurrency;
    const baseToReportingRate = baseCurrency === reportingCurrency ? 1 : input.baseToReportingRate;
    const amountReporting = baseToReportingRate && baseToReportingRate > 0
      ? roundMoney(amountBase * baseToReportingRate, reportingCurrency)
      : undefined;
    const splitMethod = input.recordType === "transfer" ? "exact" : input.splitMethod;
    const splitInputs = input.recordType === "transfer"
      ? [{ memberId: input.splitInputs[0].memberId, value: amountBase }]
      : input.splitInputs;
    const splits = allocateSplits(recordId, amountBase, baseCurrency, splitMethod, splitInputs);
    let localReceiptId: string | undefined;
    if (input.receipt) {
      localReceiptId = id("receipt");
      await saveReceipt(localReceiptId, input.receipt);
    }
    const record = {
      id: recordId,
      recordType: input.recordType,
      groupId: input.groupId,
      eventId: event?.id,
      description: input.description.trim(),
      categoryId: input.categoryId,
      transactionDate: new Date(input.transactionDate).toISOString(),
      payerId: input.payerId,
      amountOriginal: input.amountOriginal,
      currencyOriginal: input.currencyOriginal,
      exchangeRate,
      amountBase,
      baseCurrency,
      exchangeRateDate: converted ? input.exchangeRateDate ?? input.transactionDate.slice(0, 10) : input.transactionDate.slice(0, 10),
      exchangeRateSource: converted ? input.exchangeRateSource ?? "manual" as const : "same-currency" as const,
      exchangeRateProvider: converted ? input.exchangeRateProvider : undefined,
      reportingCurrency: baseToReportingRate ? reportingCurrency : undefined,
      baseToReportingRate,
      amountReporting,
      reportingRateSource: baseCurrency === reportingCurrency ? "same-currency" as const : input.reportingRateSource,
      reportingRateDate: baseToReportingRate ? input.reportingRateDate ?? input.transactionDate.slice(0, 10) : undefined,
      reportingRateProvider: input.reportingRateProvider,
      localReceiptId,
      receiptName: input.receipt?.name,
      notes: input.notes?.trim() || undefined,
      createdBy: snapshot.currentUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: "pending" as const,
      splits,
    };
    setSnapshot((current) => ({
      ...current,
      records: [record, ...current.records],
      activity: [{ id: id("activity"), groupId: input.groupId, eventId: event?.id, actorId: current.currentUser.id, type: "record_created", title: `${record.description} ${record.recordType} added`, detail: `${record.currencyOriginal} ${record.amountOriginal.toFixed(record.currencyOriginal === "JPY" ? 0 : 2)}`, createdAt: timestamp }, ...current.activity],
    }));
    const eventMembers = event ? snapshot.members.filter((member) => member.eventId === event.id) : undefined;
    await enqueue({ entityType: "record", entityId: recordId, action: "upsert", payload: { record, baseVersion: 0, category: snapshot.categories.find((item) => item.id === record.categoryId), eventMembers } });
    return recordId;
  }, [enqueue, snapshot.categories, snapshot.currentUser.defaultCurrency, snapshot.currentUser.id, snapshot.events, snapshot.groups, snapshot.members]);

  const deleteRecord = useCallback((recordId: string) => {
    const record = snapshot.records.find((item) => item.id === recordId);
    if (!record) return;
    setSnapshot((current) => ({ ...current, records: current.records.filter((record) => record.id !== recordId) }));
    void enqueue({ entityType: "record", entityId: recordId, action: "delete", payload: { recordId, groupId: record.groupId, baseVersion: record.version, baseFingerprint: recordSyncFingerprint(record) } });
  }, [enqueue, snapshot.records]);

  const setRecordReportingRate = useCallback((recordId: string, rate: number) => {
    const existing = snapshot.records.find((record) => record.id === recordId);
    if (!existing) throw new Error("Record not found.");
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Exchange rate must be above zero.");
    const reportingCurrency = snapshot.currentUser.defaultCurrency;
    const updated: LedgerRecord = {
      ...existing,
      reportingCurrency,
      baseToReportingRate: rate,
      amountReporting: roundMoney(existing.amountBase * rate, reportingCurrency),
      reportingRateSource: "manual",
      reportingRateDate: existing.transactionDate.slice(0, 10),
      reportingRateProvider: undefined,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
      syncStatus: "pending",
    };
    setSnapshot((current) => ({ ...current, records: current.records.map((record) => record.id === recordId ? updated : record) }));
    const eventMembers = updated.eventId ? snapshot.members.filter((member) => member.eventId === updated.eventId) : undefined;
    void enqueue({ entityType: "record", entityId: recordId, action: "upsert", payload: { record: updated, baseVersion: existing.version, baseFingerprint: recordSyncFingerprint(existing), category: snapshot.categories.find((item) => item.id === updated.categoryId), eventMembers } });
  }, [enqueue, snapshot.categories, snapshot.currentUser.defaultCurrency, snapshot.records, snapshot.members]);

  const addDebtRecords = useCallback(async (inputs: AddDebtRecordInput[], photos: File[] = []) => {
    if (inputs.length === 0) throw new Error("Enter at least one person's name.");
    for (const input of inputs) {
      if (!input.personName.trim()) throw new Error("Enter the other person's name.");
      if (!input.name.trim()) throw new Error("Enter what the debt was for.");
      if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount greater than zero.");
    }
    if (photos.length > 5) throw new Error("Attach up to 5 photos.");
    if (photos.some((photo) => !["image/jpeg", "image/png", "image/webp"].includes(photo.type) || photo.size > 15 * 1024 * 1024)) {
      throw new Error("Each photo must be a JPEG, PNG, or WebP under 15 MB.");
    }
    const localPhotoIds: string[] = [];
    for (const photo of photos) {
      const localPhotoId = id("debt-photo");
      await saveReceipt(localPhotoId, photo);
      localPhotoIds.push(localPhotoId);
    }
    const timestamp = new Date().toISOString();
    const debtRecords: DebtRecord[] = inputs.map((input) => ({
      id: id("debt"),
      direction: input.direction,
      personName: input.personName.trim(),
      name: input.name.trim(),
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      dueDate: input.dueDate || undefined,
      note: input.note?.trim() || undefined,
      localPhotoIds: localPhotoIds.length > 0 ? localPhotoIds : undefined,
      photoFileIds: localPhotoIds.length > 0 ? {} : undefined,
      photoNames: photos.length > 0 ? photos.map((photo) => photo.name) : undefined,
      status: "unpaid",
      createdBy: snapshot.currentUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncStatus: "pending",
    }));
    setSnapshot((current) => ({ ...current, debtRecords: [...debtRecords, ...current.debtRecords] }));
    for (const debtRecord of debtRecords) await enqueue({ entityType: "debt_record", entityId: debtRecord.id, action: "upsert", payload: { debtRecord } });
    return debtRecords.map((record) => record.id);
  }, [enqueue, snapshot.currentUser.id]);

  const updateDebtRecord = useCallback(async (debtRecordId: string, input: AddDebtRecordInput, photos: File[] = []) => {
    const existing = snapshot.debtRecords.find((record) => record.id === debtRecordId);
    if (!existing) throw new Error("Debt record not found.");
    if (!input.personName.trim()) throw new Error("Enter the other person's name.");
    if (!input.name.trim()) throw new Error("Enter what the debt was for.");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount greater than zero.");
    const existingPhotoCount = existing.localPhotoIds?.length ?? 0;
    if (existingPhotoCount + photos.length > 5) throw new Error("Attach up to 5 photos.");
    if (photos.some((photo) => !["image/jpeg", "image/png", "image/webp"].includes(photo.type) || photo.size > 15 * 1024 * 1024)) {
      throw new Error("Each photo must be a JPEG, PNG, or WebP under 15 MB.");
    }
    const newLocalPhotoIds: string[] = [];
    for (const photo of photos) {
      const localPhotoId = id("debt-photo");
      await saveReceipt(localPhotoId, photo);
      newLocalPhotoIds.push(localPhotoId);
    }
    const localPhotoIds = [...(existing.localPhotoIds ?? []), ...newLocalPhotoIds];
    const debtRecord: DebtRecord = {
      ...existing,
      direction: input.direction,
      personName: input.personName.trim(),
      name: input.name.trim(),
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      dueDate: input.dueDate || undefined,
      note: input.note?.trim() || undefined,
      localPhotoIds: localPhotoIds.length > 0 ? localPhotoIds : undefined,
      photoFileIds: localPhotoIds.length > 0 ? existing.photoFileIds ?? {} : undefined,
      photoNames: localPhotoIds.length > 0 ? [...(existing.photoNames ?? []), ...photos.map((photo) => photo.name)] : undefined,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    setSnapshot((current) => ({
      ...current,
      debtRecords: current.debtRecords.map((record) => record.id === debtRecordId ? debtRecord : record),
    }));
    await enqueue({ entityType: "debt_record", entityId: debtRecordId, action: "upsert", payload: { debtRecord } });
  }, [enqueue, snapshot.debtRecords]);

  const updateDebtRecordStatus = useCallback((debtRecordId: string, status: DebtStatus) => {
    const existing = snapshot.debtRecords.find((record) => record.id === debtRecordId);
    if (!existing) return;
    const debtRecord: DebtRecord = { ...existing, status, updatedAt: new Date().toISOString(), syncStatus: "pending" };
    setSnapshot((current) => ({
      ...current,
      debtRecords: current.debtRecords.map((record) => record.id === debtRecordId ? debtRecord : record),
    }));
    void enqueue({ entityType: "debt_record", entityId: debtRecordId, action: "upsert", payload: { debtRecord } });
  }, [enqueue, snapshot.debtRecords]);

  const updateRecord = useCallback(async (recordId: string, input: AddRecordInput) => {
    const existing = snapshot.records.find((record) => record.id === recordId);
    const group = snapshot.groups.find((item) => item.id === input.groupId);
    const event = input.eventId
      ? snapshot.events.find((item) => item.id === input.eventId && item.groupId === input.groupId)
      : undefined;
    if (!existing) throw new Error("Record not found.");
    if (existing.recurringPaymentId && (input.groupId || input.eventId || input.recordType !== "expense")) throw new Error("Recurring payments must remain personal expenses.");
    if (input.groupId && !group) throw new Error("Group not found.");
    if (!input.groupId && input.eventId) throw new Error("A personal record cannot belong to an event.");
    if (input.eventId && !event) throw new Error("Choose an event from this group.");
    if (input.recordType === "transfer" && !input.groupId) throw new Error("Choose a group to transfer money between members.");
    if (input.recordType === "transfer" && (input.splitInputs.length !== 1 || input.splitInputs[0].memberId === input.payerId)) {
      throw new Error("Choose one different member to receive the transfer.");
    }
    if (!input.groupId && (input.payerId !== snapshot.currentUser.id || input.splitInputs.some((split) => split.memberId !== snapshot.currentUser.id))) {
      throw new Error("Personal records can only be assigned to you.");
    }
    let localReceiptId = existing.localReceiptId;
    if (input.receipt) {
      localReceiptId = id("receipt");
      await saveReceipt(localReceiptId, input.receipt);
    }
    const baseCurrency = input.baseCurrency ?? event?.baseCurrency ?? group?.currency ?? snapshot.currentUser.defaultCurrency;
    const converted = input.currencyOriginal !== baseCurrency;
    const exchangeRate = converted ? input.exchangeRate : 1;
    const amountBase = roundMoney(input.amountOriginal * exchangeRate, baseCurrency);
    const reportingCurrency = input.reportingCurrency ?? existing.reportingCurrency ?? snapshot.currentUser.defaultCurrency;
    const baseToReportingRate = baseCurrency === reportingCurrency ? 1 : input.baseToReportingRate ?? existing.baseToReportingRate;
    const amountReporting = baseToReportingRate && baseToReportingRate > 0
      ? roundMoney(amountBase * baseToReportingRate, reportingCurrency)
      : undefined;
    const updated = {
      ...existing,
      recordType: input.recordType,
      groupId: input.groupId,
      eventId: event?.id,
      description: input.description.trim(),
      categoryId: input.categoryId,
      transactionDate: new Date(input.transactionDate).toISOString(),
      payerId: input.payerId,
      amountOriginal: input.amountOriginal,
      currencyOriginal: input.currencyOriginal,
      exchangeRate,
      amountBase,
      baseCurrency,
      exchangeRateDate: converted ? input.exchangeRateDate ?? input.transactionDate.slice(0, 10) : input.transactionDate.slice(0, 10),
      exchangeRateSource: converted ? input.exchangeRateSource ?? "manual" as const : "same-currency" as const,
      exchangeRateProvider: converted ? input.exchangeRateProvider : undefined,
      reportingCurrency: baseToReportingRate ? reportingCurrency : undefined,
      baseToReportingRate,
      amountReporting,
      reportingRateSource: baseCurrency === reportingCurrency ? "same-currency" as const : input.reportingRateSource ?? existing.reportingRateSource,
      reportingRateDate: baseToReportingRate ? input.reportingRateDate ?? existing.reportingRateDate ?? input.transactionDate.slice(0, 10) : undefined,
      reportingRateProvider: input.reportingRateProvider ?? existing.reportingRateProvider,
      localReceiptId,
      receiptName: input.receipt?.name ?? existing.receiptName,
      notes: input.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
      syncStatus: "pending" as const,
      splits: allocateSplits(
        recordId,
        amountBase,
        baseCurrency,
        input.recordType === "transfer" ? "exact" : input.splitMethod,
        input.recordType === "transfer" ? [{ memberId: input.splitInputs[0].memberId, value: amountBase }] : input.splitInputs,
      ),
    };
    setSnapshot((current) => ({ ...current, records: current.records.map((record) => record.id === recordId ? updated : record) }));
    const eventMembers = event ? snapshot.members.filter((member) => member.eventId === event.id) : undefined;
    await enqueue({ entityType: "record", entityId: recordId, action: "upsert", payload: { record: updated, baseVersion: existing.version, baseFingerprint: recordSyncFingerprint(existing), category: snapshot.categories.find((item) => item.id === updated.categoryId), eventMembers } });
  }, [enqueue, snapshot.categories, snapshot.currentUser.defaultCurrency, snapshot.currentUser.id, snapshot.events, snapshot.records, snapshot.groups, snapshot.members]);

  const addCategory = useCallback((name: string, emoji: string) => {
    const categoryId = id("category");
    const category = { id: categoryId, name: name.trim(), emoji: emoji || "🧾", isCustom: true, createdBy: snapshot.currentUser.id };
    setSnapshot((current) => ({ ...current, categories: [...current.categories, category] }));
    void enqueue({ entityType: "category", entityId: categoryId, action: "upsert", payload: { category } });
    return categoryId;
  }, [enqueue, snapshot.currentUser.id]);

  const recordSettlement = useCallback((input: RecordSettlementInput) => {
    const settlementId = id("settlement");
    const timestamp = new Date().toISOString();
    const settlement: Settlement = { id: settlementId, ...input, createdBy: snapshot.currentUser.id, createdAt: timestamp, syncStatus: "pending" };
    const groupId = snapshot.events.find((event) => event.id === settlement.events[0]?.eventId)?.groupId;
    if (!groupId) throw new Error("A settlement must belong to a Group event.");
    setSnapshot((current) => ({
      ...current,
      settlements: [settlement, ...current.settlements],
      activity: [{ id: id("activity"), eventId: input.events[0]?.eventId, actorId: current.currentUser.id, type: "settlement_recorded", title: "Payment recorded", detail: `${input.currency} ${input.amount}`, createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "settlement", entityId: settlementId, action: "upsert", payload: { settlement, groupId } });
    return settlementId;
  }, [enqueue, snapshot.currentUser.id, snapshot.events]);

  const createInvitation = useCallback(async (groupId: string, input: Partial<Pick<GroupInvitation, "approvalRequired" | "defaultRole" | "expiresAt" | "maxUses">> = {}) => {
    const group = snapshot.groups.find((item) => item.id === groupId);
    if (!group || group.ownerId !== snapshot.currentUser.id) throw new Error("Only the group owner can create an invitation.");
    const invitationId = id("invite");
    const timestamp = new Date().toISOString();
    const invitation: GroupInvitation = {
      id: invitationId,
      groupId,
      token: invitationToken(),
      createdBy: snapshot.currentUser.id,
      approvalRequired: input.approvalRequired ?? true,
      defaultRole: input.defaultRole ?? "member",
      expiresAt: input.expiresAt,
      maxUses: input.maxUses,
      useCount: 0,
      isActive: true,
      createdAt: timestamp,
    };
    await collaborationRequest("/api/collaboration", { method: "POST", body: JSON.stringify({ action: "create", invitation, group }) });
    setSnapshot((current) => ({
      ...current,
      invitations: [invitation, ...current.invitations],
      activity: [{ id: id("activity"), groupId, actorId: current.currentUser.id, type: "invitation_created", title: "Group invitation link created", detail: "Owner approval is required", createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "invitation", entityId: invitationId, action: "upsert", payload: { invitation } });
    return invitation.token;
  }, [enqueue, snapshot.currentUser.id, snapshot.groups]);

  const revokeInvitation = useCallback(async (invitationId: string) => {
    const timestamp = new Date().toISOString();
    const invitation = snapshot.invitations.find((item) => item.id === invitationId);
    if (!invitation) return;
    await collaborationRequest("/api/collaboration", { method: "POST", body: JSON.stringify({ action: "revoke", invitationId }) });
    const updated = { ...invitation, isActive: false, revokedAt: timestamp };
    setSnapshot((current) => ({
      ...current,
      invitations: current.invitations.map((item) => item.id === invitationId ? updated : item),
      activity: [{ id: id("activity"), groupId: invitation.groupId, actorId: current.currentUser.id, type: "invitation_revoked", title: "Group invitation link revoked", detail: "Existing members keep their access", createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "invitation", entityId: invitationId, action: "upsert", payload: { invitation: updated } });
  }, [enqueue, snapshot.invitations]);

  const adoptApprovedInvitation = useCallback((preview: GroupInvitationPreview) => {
    const timestamp = new Date().toISOString();
    setSnapshot((current) => {
      const groupMember: GroupMember = {
        id: id("group-member"), groupId: preview.group.id, userId: current.currentUser.id,
        name: current.currentUser.name, email: current.currentUser.email, role: preview.defaultRole,
        status: "active", joinedAt: timestamp, avatarColor: "var(--color-avatar-success)",
      };
      return {
        ...current,
        groups: current.groups.some((item) => item.id === preview.group.id) ? current.groups : [...current.groups, preview.group],
        groupMembers: current.groupMembers.some((item) => item.groupId === preview.group.id && item.userId === current.currentUser.id)
          ? current.groupMembers
          : [...current.groupMembers, groupMember],
      };
    });
  }, []);

  const resolveInvitation = useCallback(async (token: string) => {
    try {
      const result = await collaborationRequest<{ preview: GroupInvitationPreview }>(`/api/collaboration?token=${encodeURIComponent(token)}`);
      if (result.preview.requestStatus === "approved") adoptApprovedInvitation(result.preview);
      return result.preview;
    } catch {
      return undefined;
    }
  }, [adoptApprovedInvitation]);

  const requestJoin = useCallback(async (token: string) => {
    try {
      const result = await collaborationRequest<{ status: "created" | "duplicate" | "invalid" | "approved"; preview?: GroupInvitationPreview }>("/api/collaboration", { method: "POST", body: JSON.stringify({ action: "request", token }) });
      if (result.status === "approved" && result.preview) adoptApprovedInvitation(result.preview);
      return result.status;
    } catch {
      return "invalid" as const;
    }
  }, [adoptApprovedInvitation]);

  const refreshJoinRequests = useCallback(async (groupId: string) => {
    const result = await collaborationRequest<{ requests: JoinRequest[] }>(`/api/collaboration?groupId=${encodeURIComponent(groupId)}`);
    setSnapshot((current) => ({
      ...current,
      joinRequests: [...current.joinRequests.filter((item) => item.groupId !== groupId || item.status !== "pending"), ...result.requests],
    }));
  }, []);

  const reviewJoinRequest = useCallback(async (requestId: string, decision: "approved" | "rejected", role: Exclude<MemberRole, "owner"> = "member") => {
    const timestamp = new Date().toISOString();
    const request = snapshot.joinRequests.find((item) => item.id === requestId);
    if (!request || request.status !== "pending") return;
    const group = snapshot.groups.find((item) => item.id === request.groupId);
    if (!group || group.ownerId !== snapshot.currentUser.id) return;
    await collaborationRequest("/api/collaboration", { method: "POST", body: JSON.stringify({ action: "review", requestId, decision, role }) });
    const updated: JoinRequest = { ...request, status: decision, assignedRole: decision === "approved" ? role : undefined, reviewedBy: snapshot.currentUser.id, reviewedAt: timestamp };
    const groupMember: GroupMember | undefined = decision === "approved" ? { id: id("group-member"), groupId: request.groupId, userId: request.requesterUserId, name: request.requesterName, email: request.requesterEmail, role, status: "active", joinedAt: timestamp, avatarColor: "var(--color-avatar-success)" } : undefined;
    const eventMembers = groupMember ? snapshot.events.filter((event) => event.groupId === request.groupId).map((event) => groupMemberToEventMember(groupMember, event.id)) : [];
    setSnapshot((current) => ({
      ...current,
      joinRequests: current.joinRequests.map((item) => item.id === requestId ? updated : item),
      groupMembers: groupMember ? [...current.groupMembers, groupMember] : current.groupMembers,
      members: eventMembers.length > 0 ? [...current.members, ...eventMembers] : current.members,
      activity: [{ id: id("activity"), groupId: request.groupId, actorId: current.currentUser.id, type: decision === "approved" ? "join_approved" : "join_rejected", title: `${request.requesterName} ${decision}`, detail: decision === "approved" ? `Added to the group as ${role}` : "Request closed", createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "join_request", entityId: requestId, action: "upsert", payload: { request: updated, groupMember, eventMembers } });
  }, [enqueue, snapshot.currentUser.id, snapshot.events, snapshot.groups, snapshot.joinRequests]);

  const resolveSyncConflict = useCallback(async (entityId: string, choice: "phone" | "google") => {
    const conflict = syncConflicts.find((item) => item.entityId === entityId);
    if (!conflict) return "resolved" as const;
    const group = snapshot.groups.find((item) => item.id === conflict.groupId);
    const ownerMember = snapshot.groupMembers.find((member) => member.groupId === conflict.groupId && member.role === "owner" && member.status === "active");
    const isOwner = Boolean(group && (group.ownerId === snapshot.currentUser.id || ownerMember?.userId === snapshot.currentUser.id || ownerMember?.email.toLowerCase() === snapshot.currentUser.email.toLowerCase()));
    if (choice === "phone" && !isOwner) {
      setSyncMessage("Phone copy kept locally — only the Group owner can replace the Google Sheet copy");
      setAutoSyncPaused(true);
      return "owner-required" as const;
    }
    const queued = await listPendingOperations();
    await removePendingOperations(queued.filter((operation) => operation.entityType === "record" && operation.entityId === entityId).map((operation) => operation.id));
    if (choice === "google") {
      setSnapshot((current) => ({
        ...current,
        records: conflict.remoteRecord
          ? [conflict.remoteRecord, ...current.records.filter((record) => record.id !== entityId)]
          : current.records.filter((record) => record.id !== entityId),
      }));
      setSyncMessage("Conflict resolved with the Google Sheet copy");
    } else {
      const local = snapshot.records.find((record) => record.id === entityId);
      const operationId = id("operation");
      if (conflict.localAction === "delete") {
        await queueOperation({ id: operationId, idempotencyKey: operationId, entityType: "record", entityId, action: "delete", payload: { groupId: conflict.groupId, baseVersion: conflict.remoteVersion, baseFingerprint: conflict.remoteRecord ? recordSyncFingerprint(conflict.remoteRecord) : undefined, force: true }, createdAt: new Date().toISOString(), attempts: 0, status: "pending" });
      } else {
        if (!local) throw new Error("The phone copy is no longer available.");
        const updated: LedgerRecord = { ...local, version: Math.max(local.version, conflict.remoteVersion) + 1, updatedAt: new Date().toISOString(), syncStatus: "pending" };
        await queueOperation({
          id: operationId,
          idempotencyKey: operationId,
          entityType: "record",
          entityId,
          action: "upsert",
          payload: {
            record: updated,
            baseVersion: conflict.remoteVersion,
            baseFingerprint: conflict.remoteRecord ? recordSyncFingerprint(conflict.remoteRecord) : undefined,
            force: true,
            category: snapshot.categories.find((category) => category.id === updated.categoryId),
            eventMembers: updated.eventId ? snapshot.members.filter((member) => member.eventId === updated.eventId) : undefined,
          },
          createdAt: new Date().toISOString(),
          attempts: 0,
          status: "pending",
        });
        setSnapshot((current) => ({ ...current, records: current.records.map((record) => record.id === entityId ? updated : record) }));
      }
      setSyncMessage("Phone copy selected — ready to sync");
    }
    const remainingConflicts = syncConflicts.filter((item) => item.entityId !== entityId);
    setSyncConflicts(remainingConflicts);
    setAutoSyncPaused(remainingConflicts.length > 0);
    await refreshPending();
    return "resolved" as const;
  }, [refreshPending, snapshot.categories, snapshot.currentUser.email, snapshot.currentUser.id, snapshot.records, snapshot.groupMembers, snapshot.groups, snapshot.members, syncConflicts]);

  const syncNow = useCallback(async (options?: { allowGoogleFolderCreation?: boolean }) => {
    if (syncInFlightRef.current || restoreModeRef.current) return;
    syncInFlightRef.current = true;
    let operations: PendingOperation[] = [];
    try {
      if (!navigator.onLine) {
        setSyncMessage("Offline — changes are safe on this device");
        return;
      }
      const quotaWaitMs = quotaBackoffUntilRef.current - Date.now();
      if (quotaWaitMs > 0) {
        setSyncMessage(`Google Sheets is cooling down — retrying in ${Math.ceil(quotaWaitMs / 1000)} seconds`);
        return;
      }
      operations = (await listPendingOperations()).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 100);
      if (!googleConnected) {
        setSyncMessage(operations.length === 0 ? "Saved on this device" : `${operations.length} change${operations.length === 1 ? "" : "s"} saved locally — connect Google to sync`);
        return;
      }
      setSyncing(true);
      setSyncMessage("Syncing with Google Drive…");
      const uploadedDebtPhotos = new Map<string, string>();
      for (const pending of operations) {
        if (pending.entityType !== "debt_record") continue;
        const debtRecord = (pending.payload as { debtRecord?: DebtRecord }).debtRecord;
        for (const [localPhotoId, fileId] of Object.entries(debtRecord?.photoFileIds ?? {})) uploadedDebtPhotos.set(localPhotoId, fileId);
      }
      for (const operation of operations) {
        const payload = operation.payload as {
          event?: Omit<BillEvent, "groupId"> & { groupId?: string };
          record?: Omit<LedgerRecord, "groupId"> & { groupId?: string };
          debtRecord?: DebtRecord;
          invitation?: Omit<GroupInvitation, "groupId"> & { eventId?: string; groupId?: string };
          request?: Omit<JoinRequest, "groupId"> & { eventId?: string; groupId?: string };
        };
        if (payload.event && !payload.event.groupId) payload.event.groupId = snapshot.events.find((event) => event.id === payload.event?.id)?.groupId;
        if (payload.record?.eventId && !payload.record.groupId) payload.record.groupId = snapshot.events.find((event) => event.id === payload.record?.eventId)?.groupId;
        if (payload.invitation && !payload.invitation.groupId) payload.invitation.groupId = snapshot.events.find((event) => event.id === payload.invitation?.eventId)?.groupId;
        if (payload.request && !payload.request.groupId) payload.request.groupId = snapshot.events.find((event) => event.id === payload.request?.eventId)?.groupId;
        if (operation.entityType === "debt_record" && payload.debtRecord?.localPhotoIds?.length) {
          const debtRecord = payload.debtRecord;
          const localPhotoIds = debtRecord.localPhotoIds ?? [];
          const photoFileIds = { ...(debtRecord.photoFileIds ?? {}) };
          let changed = false;
          for (const localPhotoId of localPhotoIds) {
            if (photoFileIds[localPhotoId]) continue;
            const cachedFileId = uploadedDebtPhotos.get(localPhotoId);
            if (cachedFileId) {
              photoFileIds[localPhotoId] = cachedFileId;
              changed = true;
              continue;
            }
            const photo = await getReceipt(localPhotoId);
            if (!photo) continue;
            const form = new FormData();
            form.set("file", new File([photo.blob], photo.name, { type: photo.type }));
            form.set("scope", "personal");
            form.set("recordId", operation.entityId);
            form.set("recordType", "debt_record");
            form.set("eventName", "Debt records");
            form.set("allowRootCreation", String(Boolean(options?.allowGoogleFolderCreation)));
            const upload = await fetch("/api/receipts", { method: "POST", body: form });
            const uploadResult = (await upload.json()) as { fileId?: string; error?: string; code?: string };
            if (!upload.ok || !uploadResult.fileId) {
              if (upload.status === 409 && uploadResult.code === GOOGLE_FOLDER_CREATION_REQUIRED) throw new GoogleFolderCreationRequiredError();
              throw new Error(uploadResult.error ?? "Debt photo upload failed.");
            }
            const { fileId } = uploadResult;
            uploadedDebtPhotos.set(localPhotoId, fileId);
            photoFileIds[localPhotoId] = fileId;
            changed = true;
          }
          if (changed) {
            debtRecord.photoFileIds = photoFileIds;
            operation.payload = { ...payload, debtRecord };
            await updatePendingOperation(operation);
            setSnapshot((current) => ({
              ...current,
              debtRecords: current.debtRecords.map((item) => item.id === operation.entityId ? { ...item, photoFileIds } : item),
            }));
          }
          continue;
        }
        if (operation.entityType !== "record") continue;
        const recordPayload = operation.payload as { record?: { localReceiptId?: string; receiptFileId?: string; groupId?: string; eventId?: string; recordType?: LedgerRecord["recordType"] } };
        const record = recordPayload.record;
        if (!record?.localReceiptId || record.receiptFileId) continue;
        const receipt = await getReceipt(record.localReceiptId);
        if (!receipt) continue;
        const event = snapshot.events.find((item) => item.id === record.eventId);
        const group = snapshot.groups.find((item) => item.id === record.groupId);
        const eventName = !record.groupId
          ? "Myself - Personal records"
          : event
          ? `${group?.name ?? "Group"} - ${event.name}`
          : `${group?.name ?? "Group"} - Daily records`;
        const form = new FormData();
        form.set("file", new File([receipt.blob], receipt.name, { type: receipt.type }));
        form.set("scope", record.groupId ? "group" : "personal");
        form.set("recordId", operation.entityId);
        form.set("recordType", record.recordType ?? "expense");
        if (record.groupId) form.set("groupId", record.groupId);
        if (group?.name) form.set("groupName", group.name);
        form.set("eventName", eventName);
        form.set("allowRootCreation", String(Boolean(options?.allowGoogleFolderCreation)));
        const upload = await fetch("/api/receipts", { method: "POST", body: form });
        const uploadResult = (await upload.json()) as { fileId?: string; error?: string; code?: string };
        if (!upload.ok || !uploadResult.fileId) {
          if (upload.status === 409 && uploadResult.code === GOOGLE_FOLDER_CREATION_REQUIRED) throw new GoogleFolderCreationRequiredError();
          throw new Error(uploadResult.error ?? "Receipt upload failed.");
        }
        const { fileId } = uploadResult;
        record.receiptFileId = fileId;
        operation.payload = recordPayload;
        await updatePendingOperation(operation);
        setSnapshot((current) => ({ ...current, records: current.records.map((item) => item.id === operation.entityId ? { ...item, receiptFileId: fileId } : item) }));
      }
      const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations, snapshot, allowRootCreation: Boolean(options?.allowGoogleFolderCreation) }) });
      const result = (await response.json()) as { syncedOperationIds?: string[]; conflicts?: RecordSyncConflict[]; pulledGroupIds?: string[]; remoteRecords?: LedgerRecord[]; remoteGroupStates?: RemoteGroupState[]; unavailableGroups?: Array<{ id: string; name: string }>; deletedGroups?: Array<{ id: string; name: string; deletedAt: string }>; error?: string; code?: string; retryAfterSeconds?: number };
      if (!response.ok || !result.syncedOperationIds) {
        if (response.status === 409 && result.code === GOOGLE_FOLDER_CREATION_REQUIRED) throw new GoogleFolderCreationRequiredError();
        if (response.status === 429) {
          const retryAfterSeconds = Number.isFinite(result.retryAfterSeconds) ? Math.max(result.retryAfterSeconds ?? 60, 60) : 60;
          const backoffSeconds = Math.min(retryAfterSeconds * (2 ** quotaBackoffAttemptRef.current), 15 * 60);
          quotaBackoffAttemptRef.current += 1;
          quotaBackoffUntilRef.current = Date.now() + backoffSeconds * 1000;
          if (quotaRetryTimerRef.current) clearTimeout(quotaRetryTimerRef.current);
          quotaRetryTimerRef.current = setTimeout(() => {
            quotaRetryTimerRef.current = undefined;
            quotaBackoffUntilRef.current = 0;
            setAutoSyncPaused(false);
            setSyncMessage("Retrying Google sync…");
          }, backoffSeconds * 1000);
        }
        throw new Error(result.error ?? "Google sync failed.");
      }
      await removePendingOperations(result.syncedOperationIds);
      const remainingOperations = await listPendingOperations();
      const protectedRecordIds = new Set(remainingOperations.filter((operation) => operation.entityType === "record").map((operation) => operation.entityId));
      const pulledGroupIds = new Set(result.pulledGroupIds ?? []);
      const remoteRecords = result.remoteRecords ?? [];
      const remoteGroupStates = result.remoteGroupStates ?? [];
      const protectedIds = new Set(remainingOperations.map((operation) => operation.entityId));
      const remoteGroups = remoteGroupStates.map((state) => state.group);
      const remoteGroupMembers = remoteGroupStates.flatMap((state) => state.groupMembers);
      const remoteEvents = remoteGroupStates.flatMap((state) => state.events);
      const remoteMembers = remoteGroupStates.flatMap((state) => state.members);
      const remoteCategories = remoteGroupStates.flatMap((state) => state.categories);
      const remoteIds = new Set(remoteRecords.map((record) => record.id));
      const unavailableGroups = result.unavailableGroups ?? [];
      const deletedGroups = result.deletedGroups ?? [];
      const detectedAt = new Date().toISOString();
      setSnapshot((current) => removeDeletedGroups({
        ...current,
        groups: mergeRemoteById(current.groups, remoteGroups, protectedIds),
        groupMembers: mergeRemoteById(current.groupMembers, remoteGroupMembers, protectedIds),
        events: mergeRemoteById(current.events, remoteEvents, protectedIds),
        members: mergeRemoteById(current.members, remoteMembers, protectedIds),
        categories: mergeRemoteById(current.categories, remoteCategories, protectedIds),
        recurringPayments: current.recurringPayments.map((payment) => result.syncedOperationIds?.some((operationId) => {
          const operation = operations.find((item) => item.id === operationId);
          return operation?.entityType === "recurring_payment" && operation.entityId === payment.id && (operation.payload as { recurringPayment: { version: number } }).recurringPayment.version === payment.version;
        }) ? { ...payment, syncStatus: "synced" } : payment),
        records: [
          ...remoteRecords.map((remote) => {
            const local = current.records.find((record) => record.id === remote.id);
            return protectedRecordIds.has(remote.id) && local ? local : { ...remote, localReceiptId: local?.localReceiptId, receiptName: local?.receiptName, syncStatus: "synced" as const };
          }),
          ...current.records.filter((record) => !remoteIds.has(record.id) && (!record.groupId || !pulledGroupIds.has(record.groupId) || protectedRecordIds.has(record.id))).map((item) => result.syncedOperationIds?.some((operationId) => operations.find((operation) => operation.id === operationId)?.entityId === item.id) ? { ...item, syncStatus: "synced" as const } : item),
        ],
        debtRecords: current.debtRecords.map((item) => result.syncedOperationIds?.some((operationId) => operations.find((operation) => operation.id === operationId)?.entityId === item.id) ? { ...item, syncStatus: "synced" } : item),
        settlements: current.settlements.map((item) => result.syncedOperationIds?.some((operationId) => operations.find((operation) => operation.id === operationId)?.entityId === item.id) ? { ...item, syncStatus: "synced" } : item),
      }, deletedGroups, deletedGroups[0]?.deletedAt ?? detectedAt));
      if (deletedGroups.some((group) => group.id === selectedGroupId)) {
        setSelectedGroupId(undefined);
        setPersonalContext(false);
        localStorage.removeItem(SELECTED_CONTEXT_KEY);
      }
      if (result.conflicts?.length) {
        setSyncConflicts((current) => [...new Map([...current, ...result.conflicts!].map((conflict) => [conflict.entityId, conflict])).values()]);
      }
      if (deletedGroups.length > 0) setSyncConflicts((current) => current.filter((conflict) => !deletedGroups.some((group) => group.id === conflict.groupId)));
      await refreshPending();
      quotaBackoffUntilRef.current = 0;
      quotaBackoffAttemptRef.current = 0;
      if (quotaRetryTimerRef.current) {
        clearTimeout(quotaRetryTimerRef.current);
        quotaRetryTimerRef.current = undefined;
      }
      setAutoSyncPaused(Boolean(result.conflicts?.length));
      const completedAt = new Date().toISOString();
      setLastSyncAt(completedAt);
      setGoogleFolderCreationRequired(false);
      setSyncMessage(deletedGroups.length > 0
        ? `${deletedGroups.length} Group${deletedGroups.length === 1 ? " was" : "s were"} deleted by the owner and removed from this device`
        : unavailableGroups.length > 0
          ? `${unavailableGroups.length} Group${unavailableGroups.length === 1 ? " is" : "s are"} temporarily unavailable; local data and pending changes were kept`
          : result.conflicts?.length
            ? `${result.conflicts.length} record conflict${result.conflicts.length === 1 ? "" : "s"} need review in Settings`
            : "Synced with Google Drive");
    } catch (error) {
      if (error instanceof GoogleFolderCreationRequiredError) {
        setGoogleFolderCreationRequired(true);
        setAutoSyncPaused(true);
        setSyncMessage("Confirm Google Drive folder creation to continue syncing");
        return;
      }
      for (const operation of operations) {
        await updatePendingOperation({ ...operation, status: "failed", attempts: operation.attempts + 1, lastError: error instanceof Error ? error.message : "Sync failed" });
      }
      setAutoSyncPaused(true);
      setSyncMessage(error instanceof Error ? error.message : "Sync failed — your local changes are safe");
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }, [googleConnected, refreshPending, selectedGroupId, snapshot]);

  const confirmGoogleFolderCreation = useCallback(async () => {
    setGoogleFolderCreationRequired(false);
    setAutoSyncPaused(false);
    await syncNow({ allowGoogleFolderCreation: true });
  }, [syncNow]);

  const dismissGoogleFolderCreation = useCallback(() => {
    setGoogleFolderCreationRequired(false);
    setAutoSyncPaused(true);
    setSyncMessage("Google Drive folder creation cancelled — changes remain on this device");
  }, []);

  useEffect(() => {
    if (isOnline && googleConnected && hydrated && pendingCount > 0 && !syncing && !autoSyncPaused && !restoreMode) {
      queueMicrotask(() => void syncNow());
    }
  }, [autoSyncPaused, googleConnected, hydrated, isOnline, pendingCount, syncing, syncNow, restoreMode]);

  useEffect(() => {
    if (!isOnline || !googleConnected) {
      initialSharedPullRef.current = false;
      return;
    }
    if (!hydrated || syncing || restoreMode || initialSharedPullRef.current || snapshot.groups.length === 0) return;
    initialSharedPullRef.current = true;
    queueMicrotask(() => void syncNow());
  }, [googleConnected, hydrated, isOnline, restoreMode, snapshot.groups.length, syncNow, syncing]);

  const resetPhoneData = useCallback(async () => {
    if (syncInFlightRef.current) throw new Error("Wait for the current sync to finish, then try again.");
    await clearLocalData();
    quotaBackoffUntilRef.current = 0;
    quotaBackoffAttemptRef.current = 0;
    if (quotaRetryTimerRef.current) {
      clearTimeout(quotaRetryTimerRef.current);
      quotaRetryTimerRef.current = undefined;
    }
    const nextSnapshot = emptySnapshot(snapshot.currentUser);
    setSnapshot(nextSnapshot);
    setSelectedGroupId(undefined);
    setPersonalContext(false);
    localStorage.removeItem(SELECTED_CONTEXT_KEY);
    setPendingCount(0);
    setSyncConflicts([]);
    setAutoSyncPaused(false);
    setSyncMessage("Phone data reset");
    await saveSnapshot(nextSnapshot);
  }, [snapshot.currentUser]);

  const factoryReset = useCallback(async () => {
    if (!googleConnected) throw new Error("Connect Google before factory reset.");
    if (syncInFlightRef.current) throw new Error("Wait for the current sync to finish, then try again.");
    setSyncing(true);
    try {
      const response = await fetch("/api/factory-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "factory reset" }) });
      const result = await response.json() as { error?: string; trashedRoots?: number };
      if (!response.ok) throw new Error(result.error ?? "Could not reset Google Drive storage.");
      await resetPhoneData();
      setSyncMessage(result.trashedRoots ? "Factory reset complete — Google Drive storage moved to Trash" : "Factory reset complete — no Bill Moshi Drive storage was found");
    } finally { setSyncing(false); }
  }, [googleConnected, resetPhoneData]);

  const restoreMockRecords = useCallback(async () => {
    if (syncInFlightRef.current) throw new Error("Wait for the current sync to finish, then try again.");
    await clearLocalData();
    const mockSnapshot = structuredClone(seedSnapshot);
    setSnapshot(mockSnapshot);
    setSelectedGroupId(mockSnapshot.groups[0]?.id);
    setPersonalContext(false);
    localStorage.setItem(SELECTED_CONTEXT_KEY, mockSnapshot.groups[0]?.id ?? "");
    setPendingCount(0);
    setSyncConflicts([]);
    setAutoSyncPaused(false);
    setSyncMessage("Mock records restored");
    await saveSnapshot(mockSnapshot);
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    setRestoreMode, restoreGoogleBackup,
    saveRecurringPayment, changeRecurringPayment, recurringError,
    snapshot, selectedGroupId, personalContext, hydrated, isOnline, googleConnected, pendingCount, syncing, syncMessage, syncConflicts, googleFolderCreationRequired, lastSyncAt,
    selectGroup, selectPersonal, updateDefaultCurrency,
    createGroup, updateGroupCurrency, updateGroupNotes, leaveGroup, deleteGroup, createEvent, updateEvent, deleteEvent, addRecord, updateRecord, setRecordReportingRate, deleteRecord, addDebtRecords, updateDebtRecord, updateDebtRecordStatus, addCategory, recordSettlement, createInvitation,
    revokeInvitation, resolveInvitation, requestJoin, refreshJoinRequests, reviewJoinRequest, syncNow, confirmGoogleFolderCreation, dismissGoogleFolderCreation, resolveSyncConflict, dismissGroupDeletionNotice, resetPhoneData, factoryReset, restoreMockRecords,
  }), [setRestoreMode, restoreGoogleBackup, saveRecurringPayment, changeRecurringPayment, recurringError, snapshot, selectedGroupId, personalContext, hydrated, isOnline, googleConnected, pendingCount, syncing, syncMessage, syncConflicts, googleFolderCreationRequired, lastSyncAt, selectGroup, selectPersonal, dismissGroupDeletionNotice, updateDefaultCurrency, createGroup, updateGroupCurrency, updateGroupNotes, leaveGroup, deleteGroup, createEvent, updateEvent, deleteEvent, addRecord, updateRecord, setRecordReportingRate, deleteRecord, addDebtRecords, updateDebtRecord, updateDebtRecordStatus, addCategory, recordSettlement, createInvitation, revokeInvitation, resolveInvitation, requestJoin, refreshJoinRequests, reviewJoinRequest, syncNow, confirmGoogleFolderCreation, dismissGoogleFolderCreation, resolveSyncConflict, resetPhoneData, factoryReset, restoreMockRecords]);

  return <AppContext.Provider value={value}>{hydrated ? children : <main className="grid min-h-dvh place-items-center bg-white p-6"><p role="status" className="max-w-sm text-center text-sm font-semibold text-muted">{startupMessage}</p></main>}</AppContext.Provider>;
}

export function useBillMoshi() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useBillMoshi must be used inside BillMoshiProvider.");
  return value;
}
