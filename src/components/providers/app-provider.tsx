"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { allocateSplits, roundMoney, type SplitInput } from "@/lib/domain/calculations";
import { deleteGroupData, leaveGroupData } from "@/lib/domain/group-lifecycle";
import { seedSnapshot } from "@/lib/domain/seed";
import type {
  AppSnapshot,
  BillEvent,
  CurrencyCode,
  DebtDirection,
  DebtRecord,
  DebtStatus,
  EventMember,
  Expense,
  Group,
  GroupInvitation,
  GroupMember,
  JoinRequest,
  MemberRole,
  PendingOperation,
  RecordType,
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
} from "@/lib/store/db";

type CreateGroupInput = Pick<Group, "name" | "emoji" | "description" | "currency">;
type CreateEventInput = Pick<BillEvent, "groupId" | "name" | "emoji" | "baseCurrency" | "startDate" | "endDate">;
type UpdateEventInput = Omit<CreateEventInput, "groupId">;

export interface AddExpenseInput {
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
  exchangeRateSource?: Expense["exchangeRateSource"];
  exchangeRateProvider?: string;
  reportingCurrency?: CurrencyCode;
  baseToReportingRate?: number;
  reportingRateSource?: Expense["reportingRateSource"];
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
  snapshot: AppSnapshot;
  selectedGroupId?: string;
  personalContext: boolean;
  hydrated: boolean;
  isOnline: boolean;
  googleConnected: boolean;
  pendingCount: number;
  syncing: boolean;
  syncMessage: string;
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
  addExpense(input: AddExpenseInput): Promise<string>;
  updateExpense(expenseId: string, input: AddExpenseInput): Promise<void>;
  setExpenseReportingRate(expenseId: string, rate: number): void;
  deleteExpense(expenseId: string): void;
  addDebtRecords(inputs: AddDebtRecordInput[], photos?: File[]): Promise<string[]>;
  updateDebtRecord(debtRecordId: string, input: AddDebtRecordInput, photos?: File[]): Promise<void>;
  updateDebtRecordStatus(debtRecordId: string, status: DebtStatus): void;
  addCategory(name: string, emoji: string): string;
  recordSettlement(input: RecordSettlementInput): string;
  createInvitation(groupId: string, input?: Partial<Pick<GroupInvitation, "approvalRequired" | "defaultRole" | "expiresAt" | "maxUses">>): string;
  revokeInvitation(invitationId: string): void;
  requestJoin(token: string): "created" | "duplicate" | "invalid";
  reviewJoinRequest(requestId: string, decision: "approved" | "rejected", role?: Exclude<MemberRole, "owner">): void;
  syncNow(): Promise<void>;
  resetDemo(): Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);
const SELECTED_CONTEXT_KEY = "bill-moshi-selected-group";
const PERSONAL_CONTEXT_VALUE = "myself";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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

function completeEventMemberships(events: BillEvent[], groupMembers: GroupMember[], eventMembers: EventMember[]) {
  const completed = eventMembers.map((member) => ({ ...member }));

  for (const event of events) {
    for (const groupMember of groupMembers.filter((member) => member.groupId === event.groupId)) {
      const existingIndex = completed.findIndex(
        (member) => member.eventId === event.id && member.userId === groupMember.userId,
      );
      if (existingIndex >= 0) {
        completed[existingIndex] = {
          ...completed[existingIndex],
          name: groupMember.name,
          email: groupMember.email,
          role: groupMember.role,
          status: groupMember.status,
          avatarColor: groupMember.avatarColor,
        };
      } else if (groupMember.status === "active") {
        completed.push(groupMemberToEventMember(groupMember, event.id));
      }
    }
  }

  return completed;
}

function migrateSnapshot(saved: AppSnapshot): AppSnapshot {
  const legacy = saved as unknown as Omit<AppSnapshot, "currentUser" | "groups" | "groupMembers" | "events" | "expenses" | "debtRecords" | "invitations" | "joinRequests"> & {
    currentUser: Omit<AppSnapshot["currentUser"], "defaultCurrency"> & { defaultCurrency?: CurrencyCode };
    groups?: Array<Omit<Group, "currency"> & { currency?: CurrencyCode }>;
    groupMembers?: GroupMember[];
    events: Array<BillEvent & { groupId?: string }>;
    expenses: Array<Omit<Expense, "groupId" | "eventId" | "recordType"> & { groupId?: string; eventId?: string; recordType?: RecordType }>;
    debtRecords?: Array<Omit<DebtRecord, "status" | "name"> & { name?: string; status: DebtStatus | "open" | "settled" }>;
    invitations: Array<GroupInvitation & { eventId?: string; groupId?: string }>;
    joinRequests: Array<JoinRequest & { eventId?: string; groupId?: string }>;
  };
  const currentUser = { ...legacy.currentUser, defaultCurrency: legacy.currentUser.defaultCurrency ?? "CAD" as const };
  const groups: Group[] = legacy.groups?.length
    ? legacy.groups.map((group) => ({ ...group, currency: group.currency ?? currentUser.defaultCurrency }))
    : seedSnapshot.groups;
  const fallbackGroupId = groups[0]?.id ?? seedSnapshot.groups[0].id;
  const events = legacy.events.map((event) => ({
    ...event,
    groupId: event.groupId
      ?? seedSnapshot.events.find((seedEvent) => seedEvent.id === event.id)?.groupId
      ?? fallbackGroupId,
  }));
  const groupIdForEvent = (eventId?: string) => events.find((event) => event.id === eventId)?.groupId ?? fallbackGroupId;
  const derivedGroupMembers = groups.flatMap((group) => {
    const groupEventIds = new Set(events.filter((event) => event.groupId === group.id).map((event) => event.id));
    const byUser = new Map<string, EventMember>();
    for (const member of legacy.members.filter((item) => groupEventIds.has(item.eventId))) {
      const current = byUser.get(member.userId);
      if (!current || member.role === "owner") byUser.set(member.userId, member);
    }
    if (!byUser.has(group.ownerId)) {
      byUser.set(group.ownerId, {
        id: "legacy-owner",
        eventId: "",
        userId: group.ownerId,
        name: group.ownerId === legacy.currentUser.id ? legacy.currentUser.name : "Owner",
        email: group.ownerId === legacy.currentUser.id ? legacy.currentUser.email : "",
        role: "owner",
        status: "active",
        joinedAt: group.createdAt,
        avatarColor: "#2F80ED",
      });
    }
    return [...byUser.values()].map((member) => ({ ...member, id: `group-member-${group.id}-${member.userId}`, groupId: group.id }));
  });
  const groupMembers = legacy.groupMembers?.length ? legacy.groupMembers : derivedGroupMembers;
  return {
    ...legacy,
    currentUser,
    groups,
    groupMembers,
    events,
    members: completeEventMemberships(events, groupMembers, legacy.members),
    expenses: legacy.expenses.map((expense) => ({
      ...expense,
      recordType: expense.recordType ?? "expense",
      groupId: expense.groupId ?? (expense.eventId ? groupIdForEvent(expense.eventId) : undefined),
    })),
    debtRecords: (legacy.debtRecords ?? []).map((record) => ({
      ...record,
      name: record.name ?? "",
      status: record.status === "open" ? "unpaid" : record.status === "settled" ? "paid" : record.status,
    })),
    invitations: legacy.invitations.map((invitation) => ({ ...invitation, groupId: invitation.groupId ?? groupIdForEvent(invitation.eventId) })),
    joinRequests: legacy.joinRequests.map((request) => ({ ...request, groupId: request.groupId ?? groupIdForEvent(request.eventId) })),
  };
}

export function BillMoshiProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [snapshot, setSnapshot] = useState<AppSnapshot>(seedSnapshot);
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [personalContext, setPersonalContext] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Saved on this device");
  const [lastSyncAt, setLastSyncAt] = useState<string>();
  const googleConnected = status === "authenticated";

  const refreshPending = useCallback(async () => {
    setPendingCount((await listPendingOperations()).length);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await loadSnapshot();
      if (!active) return;
      const nextSnapshot = migrateSnapshot(saved ?? seedSnapshot);
      setSnapshot(nextSnapshot);
      const storedContext = localStorage.getItem(SELECTED_CONTEXT_KEY) ?? undefined;
      setPersonalContext(storedContext === PERSONAL_CONTEXT_VALUE);
      setSelectedGroupId(nextSnapshot.groups.some((group) => group.id === storedContext) ? storedContext : undefined);
      setIsOnline(navigator.onLine);
      await refreshPending();
      setHydrated(true);
    })();
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

  useEffect(() => {
    if (!hydrated) return;
    void saveSnapshot(snapshot);
  }, [hydrated, snapshot]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const email = session.user.email;
    const name = session.user.name || email.split("@")[0];
    const image = session.user.image ?? undefined;
    queueMicrotask(() => setSnapshot((current) => ({
        ...current,
        currentUser: {
          id: `google:${email.toLowerCase()}`,
          name,
          email,
          image,
          defaultCurrency: current.currentUser.defaultCurrency,
        },
      })));
  }, [session?.user?.email, session?.user?.image, session?.user?.name, status]);

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
      avatarColor: "#2F80ED",
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
    const nextSnapshot = deleteGroupData(snapshot, groupId, snapshot.currentUser.id);
    setSnapshot(nextSnapshot);
    if (localStorage.getItem(SELECTED_CONTEXT_KEY) === groupId) localStorage.removeItem(SELECTED_CONTEXT_KEY);
    setSelectedGroupId(undefined);
    setPersonalContext(false);
    void enqueue({
      entityType: "group",
      entityId: groupId,
      action: "delete",
      payload: { groupId, requestedBy: snapshot.currentUser.id },
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
      expenses: current.expenses.filter((expense) => expense.eventId !== eventId),
    }));
    void enqueue({ entityType: "event", entityId: eventId, action: "delete", payload: { eventId, groupId } });
  }, [enqueue, snapshot.events]);

  const addExpense = useCallback(async (input: AddExpenseInput) => {
    const group = snapshot.groups.find((item) => item.id === input.groupId);
    const event = input.eventId
      ? snapshot.events.find((item) => item.id === input.eventId && item.groupId === input.groupId)
      : undefined;
    if (input.groupId && !group) throw new Error("Group not found.");
    if (!input.groupId && input.eventId) throw new Error("A personal expense cannot belong to an event.");
    if (input.eventId && !event) throw new Error("Choose an event from this group.");
    if (input.recordType === "transfer" && !input.groupId) throw new Error("Choose a group to transfer money between members.");
    if (input.recordType === "transfer" && (input.splitInputs.length !== 1 || input.splitInputs[0].memberId === input.payerId)) {
      throw new Error("Choose one different member to receive the transfer.");
    }
    if (!input.groupId && (input.payerId !== snapshot.currentUser.id || input.splitInputs.some((split) => split.memberId !== snapshot.currentUser.id))) {
      throw new Error("Personal records can only be assigned to you.");
    }
    const expenseId = id("expense");
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
    const splits = allocateSplits(expenseId, amountBase, baseCurrency, splitMethod, splitInputs);
    let localReceiptId: string | undefined;
    if (input.receipt) {
      localReceiptId = id("receipt");
      await saveReceipt(localReceiptId, input.receipt);
    }
    const expense = {
      id: expenseId,
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
      expenses: [expense, ...current.expenses],
      activity: [{ id: id("activity"), groupId: input.groupId, eventId: event?.id, actorId: current.currentUser.id, type: "expense_created", title: `${expense.description} ${expense.recordType} added`, detail: `${expense.currencyOriginal} ${expense.amountOriginal.toFixed(expense.currencyOriginal === "JPY" ? 0 : 2)}`, createdAt: timestamp }, ...current.activity],
    }));
    const eventMembers = event ? snapshot.members.filter((member) => member.eventId === event.id) : undefined;
    await enqueue({ entityType: "expense", entityId: expenseId, action: "upsert", payload: { expense, category: snapshot.categories.find((item) => item.id === expense.categoryId), eventMembers } });
    return expenseId;
  }, [enqueue, snapshot.categories, snapshot.currentUser.defaultCurrency, snapshot.currentUser.id, snapshot.events, snapshot.groups, snapshot.members]);

  const deleteExpense = useCallback((expenseId: string) => {
    const expense = snapshot.expenses.find((item) => item.id === expenseId);
    if (!expense) return;
    setSnapshot((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== expenseId) }));
    void enqueue({ entityType: "expense", entityId: expenseId, action: "delete", payload: { expenseId, groupId: expense.groupId } });
  }, [enqueue, snapshot.expenses]);

  const setExpenseReportingRate = useCallback((expenseId: string, rate: number) => {
    const existing = snapshot.expenses.find((expense) => expense.id === expenseId);
    if (!existing) throw new Error("Record not found.");
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Exchange rate must be above zero.");
    const reportingCurrency = snapshot.currentUser.defaultCurrency;
    const updated: Expense = {
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
    setSnapshot((current) => ({ ...current, expenses: current.expenses.map((expense) => expense.id === expenseId ? updated : expense) }));
    const eventMembers = updated.eventId ? snapshot.members.filter((member) => member.eventId === updated.eventId) : undefined;
    void enqueue({ entityType: "expense", entityId: expenseId, action: "upsert", payload: { expense: updated, category: snapshot.categories.find((item) => item.id === updated.categoryId), eventMembers } });
  }, [enqueue, snapshot.categories, snapshot.currentUser.defaultCurrency, snapshot.expenses, snapshot.members]);

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

  const updateExpense = useCallback(async (expenseId: string, input: AddExpenseInput) => {
    const existing = snapshot.expenses.find((expense) => expense.id === expenseId);
    const group = snapshot.groups.find((item) => item.id === input.groupId);
    const event = input.eventId
      ? snapshot.events.find((item) => item.id === input.eventId && item.groupId === input.groupId)
      : undefined;
    if (!existing) throw new Error("Expense not found.");
    if (input.groupId && !group) throw new Error("Group not found.");
    if (!input.groupId && input.eventId) throw new Error("A personal expense cannot belong to an event.");
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
        expenseId,
        amountBase,
        baseCurrency,
        input.recordType === "transfer" ? "exact" : input.splitMethod,
        input.recordType === "transfer" ? [{ memberId: input.splitInputs[0].memberId, value: amountBase }] : input.splitInputs,
      ),
    };
    setSnapshot((current) => ({ ...current, expenses: current.expenses.map((expense) => expense.id === expenseId ? updated : expense) }));
    const eventMembers = event ? snapshot.members.filter((member) => member.eventId === event.id) : undefined;
    await enqueue({ entityType: "expense", entityId: expenseId, action: "upsert", payload: { expense: updated, category: snapshot.categories.find((item) => item.id === updated.categoryId), eventMembers } });
  }, [enqueue, snapshot.categories, snapshot.currentUser.defaultCurrency, snapshot.currentUser.id, snapshot.events, snapshot.expenses, snapshot.groups, snapshot.members]);

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

  const createInvitation = useCallback((groupId: string, input: Partial<Pick<GroupInvitation, "approvalRequired" | "defaultRole" | "expiresAt" | "maxUses">> = {}) => {
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
    setSnapshot((current) => ({
      ...current,
      invitations: [invitation, ...current.invitations],
      activity: [{ id: id("activity"), groupId, actorId: current.currentUser.id, type: "invitation_created", title: "Group invitation link created", detail: "Owner approval is required", createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "invitation", entityId: invitationId, action: "upsert", payload: { invitation } });
    return invitation.token;
  }, [enqueue, snapshot.currentUser.id, snapshot.groups]);

  const revokeInvitation = useCallback((invitationId: string) => {
    const timestamp = new Date().toISOString();
    const invitation = snapshot.invitations.find((item) => item.id === invitationId);
    if (!invitation) return;
    const updated = { ...invitation, isActive: false, revokedAt: timestamp };
    setSnapshot((current) => ({
      ...current,
      invitations: current.invitations.map((item) => item.id === invitationId ? updated : item),
      activity: [{ id: id("activity"), groupId: invitation.groupId, actorId: current.currentUser.id, type: "invitation_revoked", title: "Group invitation link revoked", detail: "Existing members keep their access", createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "invitation", entityId: invitationId, action: "upsert", payload: { invitation: updated } });
  }, [enqueue, snapshot.invitations]);

  const requestJoin = useCallback((token: string) => {
    const invitation = snapshot.invitations.find((item) => item.token === token);
    if (!invitation || !invitation.isActive || (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) || (invitation.maxUses && invitation.useCount >= invitation.maxUses)) return "invalid";
    const duplicate = snapshot.joinRequests.some((request) => request.groupId === invitation.groupId && request.requesterUserId === snapshot.currentUser.id && request.status === "pending");
    const activeMember = snapshot.groupMembers.some((member) => member.groupId === invitation.groupId && member.userId === snapshot.currentUser.id && member.status === "active");
    if (duplicate || activeMember) return "duplicate";
    const timestamp = new Date().toISOString();
    const request: JoinRequest = { id: id("request"), invitationId: invitation.id, groupId: invitation.groupId, requesterUserId: snapshot.currentUser.id, requesterName: snapshot.currentUser.name, requesterEmail: snapshot.currentUser.email, status: invitation.approvalRequired ? "pending" : "approved", requestedAt: timestamp, assignedRole: invitation.approvalRequired ? undefined : invitation.defaultRole };
    const groupMember: GroupMember | undefined = invitation.approvalRequired ? undefined : { id: id("group-member"), groupId: invitation.groupId, userId: snapshot.currentUser.id, name: snapshot.currentUser.name, email: snapshot.currentUser.email, role: invitation.defaultRole, status: "active", joinedAt: timestamp, avatarColor: "#27AE60" };
    const eventMembers = groupMember ? snapshot.events.filter((event) => event.groupId === invitation.groupId).map((event) => groupMemberToEventMember(groupMember, event.id)) : [];
    setSnapshot((current) => ({
      ...current,
      invitations: current.invitations.map((item) => item.id === invitation.id ? { ...item, useCount: item.useCount + 1 } : item),
      joinRequests: [request, ...current.joinRequests],
      groupMembers: groupMember ? [...current.groupMembers, groupMember] : current.groupMembers,
      members: eventMembers.length > 0 ? [...current.members, ...eventMembers] : current.members,
      activity: [{ id: id("activity"), groupId: invitation.groupId, actorId: current.currentUser.id, type: "join_requested", title: `${current.currentUser.name} requested to join`, detail: invitation.approvalRequired ? "Waiting for owner approval" : "Group access approved", createdAt: timestamp }, ...current.activity],
    }));
    void enqueue({ entityType: "join_request", entityId: request.id, action: "upsert", payload: { request, groupMember, eventMembers } });
    return "created";
  }, [enqueue, snapshot]);

  const reviewJoinRequest = useCallback((requestId: string, decision: "approved" | "rejected", role: Exclude<MemberRole, "owner"> = "member") => {
    const timestamp = new Date().toISOString();
    const request = snapshot.joinRequests.find((item) => item.id === requestId);
    if (!request || request.status !== "pending") return;
    const group = snapshot.groups.find((item) => item.id === request.groupId);
    if (!group || group.ownerId !== snapshot.currentUser.id) return;
    const updated: JoinRequest = { ...request, status: decision, assignedRole: decision === "approved" ? role : undefined, reviewedBy: snapshot.currentUser.id, reviewedAt: timestamp };
    const groupMember: GroupMember | undefined = decision === "approved" ? { id: id("group-member"), groupId: request.groupId, userId: request.requesterUserId, name: request.requesterName, email: request.requesterEmail, role, status: "active", joinedAt: timestamp, avatarColor: "#27AE60" } : undefined;
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

  const syncNow = useCallback(async () => {
    if (syncing) return;
    if (!navigator.onLine) {
      setSyncMessage("Offline — changes are safe on this device");
      return;
    }
    const operations = (await listPendingOperations()).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!googleConnected) {
      setSyncMessage(operations.length === 0 ? "Saved on this device" : `${operations.length} change${operations.length === 1 ? "" : "s"} saved locally — connect Google to sync`);
      return;
    }
    setSyncing(true);
    setSyncMessage("Syncing with Google Drive…");
    try {
      const uploadedDebtPhotos = new Map<string, string>();
      for (const pending of operations) {
        if (pending.entityType !== "debt_record") continue;
        const debtRecord = (pending.payload as { debtRecord?: DebtRecord }).debtRecord;
        for (const [localPhotoId, fileId] of Object.entries(debtRecord?.photoFileIds ?? {})) uploadedDebtPhotos.set(localPhotoId, fileId);
      }
      for (const operation of operations) {
        const payload = operation.payload as {
          event?: Omit<BillEvent, "groupId"> & { groupId?: string };
          expense?: Omit<Expense, "groupId"> & { groupId?: string };
          debtRecord?: DebtRecord;
          invitation?: Omit<GroupInvitation, "groupId"> & { eventId?: string; groupId?: string };
          request?: Omit<JoinRequest, "groupId"> & { eventId?: string; groupId?: string };
        };
        if (payload.event && !payload.event.groupId) payload.event.groupId = snapshot.events.find((event) => event.id === payload.event?.id)?.groupId;
        if (payload.expense?.eventId && !payload.expense.groupId) payload.expense.groupId = snapshot.events.find((event) => event.id === payload.expense?.eventId)?.groupId;
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
            const upload = await fetch("/api/receipts", { method: "POST", body: form });
            if (!upload.ok) throw new Error(((await upload.json()) as { error?: string }).error ?? "Debt photo upload failed.");
            const { fileId } = (await upload.json()) as { fileId: string };
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
        if (operation.entityType !== "expense") continue;
        const expensePayload = operation.payload as { expense?: { localReceiptId?: string; receiptFileId?: string; groupId?: string; eventId?: string } };
        const expense = expensePayload.expense;
        if (!expense?.localReceiptId || expense.receiptFileId) continue;
        const receipt = await getReceipt(expense.localReceiptId);
        if (!receipt) continue;
        const event = snapshot.events.find((item) => item.id === expense.eventId);
        const group = snapshot.groups.find((item) => item.id === expense.groupId);
        const eventName = !expense.groupId
          ? "Myself - Personal records"
          : event
          ? `${group?.name ?? "Group"} - ${event.name}`
          : `${group?.name ?? "Group"} - Daily records`;
        const form = new FormData();
        form.set("file", new File([receipt.blob], receipt.name, { type: receipt.type }));
        form.set("scope", expense.groupId ? "group" : "personal");
        form.set("expenseId", operation.entityId);
        if (expense.groupId) form.set("groupId", expense.groupId);
        if (group?.name) form.set("groupName", group.name);
        form.set("canCreateGroupWorkspace", String(Boolean(group && group.ownerId === snapshot.currentUser.id)));
        form.set("eventName", eventName);
        const upload = await fetch("/api/receipts", { method: "POST", body: form });
        if (!upload.ok) throw new Error(((await upload.json()) as { error?: string }).error ?? "Receipt upload failed.");
        const { fileId } = (await upload.json()) as { fileId: string };
        expense.receiptFileId = fileId;
        operation.payload = expensePayload;
        await updatePendingOperation(operation);
        setSnapshot((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === operation.entityId ? { ...item, receiptFileId: fileId } : item) }));
      }
      const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations, snapshot }) });
      const result = (await response.json()) as { syncedOperationIds?: string[]; error?: string };
      if (!response.ok || !result.syncedOperationIds) throw new Error(result.error ?? "Google sync failed.");
      await removePendingOperations(result.syncedOperationIds);
      setSnapshot((current) => ({
        ...current,
        expenses: current.expenses.map((item) => result.syncedOperationIds?.some((operationId) => operations.find((operation) => operation.id === operationId)?.entityId === item.id) ? { ...item, syncStatus: "synced" } : item),
        debtRecords: current.debtRecords.map((item) => result.syncedOperationIds?.some((operationId) => operations.find((operation) => operation.id === operationId)?.entityId === item.id) ? { ...item, syncStatus: "synced" } : item),
        settlements: current.settlements.map((item) => result.syncedOperationIds?.some((operationId) => operations.find((operation) => operation.id === operationId)?.entityId === item.id) ? { ...item, syncStatus: "synced" } : item),
      }));
      await refreshPending();
      const completedAt = new Date().toISOString();
      setLastSyncAt(completedAt);
      setSyncMessage("Synced with Google Drive");
    } catch (error) {
      for (const operation of operations) {
        await updatePendingOperation({ ...operation, status: "failed", attempts: operation.attempts + 1, lastError: error instanceof Error ? error.message : "Sync failed" });
      }
      setSyncMessage(error instanceof Error ? error.message : "Sync failed — your local changes are safe");
    } finally {
      setSyncing(false);
    }
  }, [googleConnected, refreshPending, snapshot, syncing]);

  useEffect(() => {
    if (isOnline && googleConnected && hydrated && pendingCount > 0) {
      queueMicrotask(() => void syncNow());
    }
  }, [googleConnected, hydrated, isOnline, pendingCount, syncNow]);

  const resetDemo = useCallback(async () => {
    await clearLocalData();
    setSnapshot(seedSnapshot);
    setSelectedGroupId(undefined);
    setPersonalContext(false);
    localStorage.removeItem(SELECTED_CONTEXT_KEY);
    setPendingCount(0);
    setSyncMessage("Demo data restored");
    await saveSnapshot(seedSnapshot);
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    snapshot, selectedGroupId, personalContext, hydrated, isOnline, googleConnected, pendingCount, syncing, syncMessage, lastSyncAt,
    selectGroup, selectPersonal, updateDefaultCurrency,
    createGroup, updateGroupCurrency, updateGroupNotes, leaveGroup, deleteGroup, createEvent, updateEvent, deleteEvent, addExpense, updateExpense, setExpenseReportingRate, deleteExpense, addDebtRecords, updateDebtRecord, updateDebtRecordStatus, addCategory, recordSettlement, createInvitation,
    revokeInvitation, requestJoin, reviewJoinRequest, syncNow, resetDemo,
  }), [snapshot, selectedGroupId, personalContext, hydrated, isOnline, googleConnected, pendingCount, syncing, syncMessage, lastSyncAt, selectGroup, selectPersonal, updateDefaultCurrency, createGroup, updateGroupCurrency, updateGroupNotes, leaveGroup, deleteGroup, createEvent, updateEvent, deleteEvent, addExpense, updateExpense, setExpenseReportingRate, deleteExpense, addDebtRecords, updateDebtRecord, updateDebtRecordStatus, addCategory, recordSettlement, createInvitation, revokeInvitation, requestJoin, reviewJoinRequest, syncNow, resetDemo]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useBillMoshi() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useBillMoshi must be used inside BillMoshiProvider.");
  return value;
}
