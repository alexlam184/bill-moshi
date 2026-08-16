export const SUPPORTED_CURRENCIES = ["CAD", "HKD", "JPY"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];
export type MemberRole = "owner" | "member" | "viewer";
export type MembershipStatus = "active" | "removed" | "left";
export type SplitMethod = "equal" | "exact" | "percentage" | "shares";
export type RecordType = "expense" | "income" | "transfer";
export type DebtDirection = "borrowed" | "lent";
export type DebtStatus = "unpaid" | "paid";
export type SyncStatus = "synced" | "pending" | "error";
export type InvitationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "revoked"
  | "cancelled";

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  defaultCurrency: CurrencyCode;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  notes?: string;
  currency: CurrencyCode;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string;
  avatarColor: string;
}

export interface EventMember {
  id: string;
  eventId: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string;
  avatarColor: string;
}

export interface BillEvent {
  id: string;
  groupId: string;
  name: string;
  emoji: string;
  startDate?: string;
  endDate?: string;
  baseCurrency: CurrencyCode;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  simplifyDebts: boolean;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  isCustom: boolean;
  createdBy?: string;
}

export interface ExpenseSplit {
  expenseId: string;
  memberId: string;
  splitMethod: SplitMethod;
  owedAmount: number;
  percentage?: number;
  shares?: number;
}

export interface Expense {
  id: string;
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
  amountBase: number;
  baseCurrency: CurrencyCode;
  exchangeRateDate?: string;
  exchangeRateSource: "same-currency" | "manual" | "fixed-event" | "automatic";
  exchangeRateProvider?: string;
  reportingCurrency?: CurrencyCode;
  baseToReportingRate?: number;
  amountReporting?: number;
  reportingRateSource?: "same-currency" | "derived" | "manual" | "automatic";
  reportingRateDate?: string;
  reportingRateProvider?: string;
  receiptFileId?: string;
  localReceiptId?: string;
  receiptName?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: SyncStatus;
  splits: ExpenseSplit[];
}

export interface SettlementEvent {
  eventId: string;
  allocatedAmount: number;
}

export interface Settlement {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  scope: "current" | "selected" | "all";
  paymentMethod: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  events: SettlementEvent[];
  syncStatus: SyncStatus;
}

export interface DebtRecord {
  id: string;
  direction: DebtDirection;
  personName: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  dueDate?: string;
  note?: string;
  localPhotoIds?: string[];
  photoFileIds?: Record<string, string>;
  photoNames?: string[];
  status: DebtStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  token: string;
  tokenHash?: string;
  createdBy: string;
  approvalRequired: boolean;
  defaultRole: Exclude<MemberRole, "owner">;
  expiresAt?: string;
  maxUses?: number;
  useCount: number;
  isActive: boolean;
  createdAt: string;
  revokedAt?: string;
}

export interface JoinRequest {
  id: string;
  invitationId: string;
  groupId: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  status: InvitationStatus;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  assignedRole?: Exclude<MemberRole, "owner">;
}

export interface ActivityEntry {
  id: string;
  groupId?: string;
  eventId?: string;
  actorId: string;
  type:
    | "group_created"
    | "event_created"
    | "expense_created"
    | "settlement_recorded"
    | "invitation_created"
    | "invitation_revoked"
    | "join_requested"
    | "join_approved"
    | "join_rejected";
  title: string;
  detail: string;
  createdAt: string;
}

export interface AppSnapshot {
  currentUser: User;
  groups: Group[];
  groupMembers: GroupMember[];
  events: BillEvent[];
  members: EventMember[];
  categories: Category[];
  expenses: Expense[];
  debtRecords: DebtRecord[];
  settlements: Settlement[];
  invitations: GroupInvitation[];
  joinRequests: JoinRequest[];
  activity: ActivityEntry[];
}

export interface PendingOperation {
  id: string;
  entityType: "user_settings" | "group" | "group_member" | "event" | "expense" | "debt_record" | "settlement" | "category" | "invitation" | "join_request";
  entityId: string;
  action: "upsert" | "delete";
  payload: unknown;
  createdAt: string;
  attempts: number;
  status: "pending" | "syncing" | "failed";
  idempotencyKey: string;
  lastError?: string;
}
