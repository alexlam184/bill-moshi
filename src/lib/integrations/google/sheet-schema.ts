export const GOOGLE_SHEET_HEADERS = {
  UserSettings: ["user_id", "email", "default_currency", "updated_at"],
  Groups: ["group_id", "group_name", "emoji", "description", "created_by", "created_at", "updated_at", "notes", "currency"],
  GroupMembers: ["group_member_id", "group_id", "user_id", "name", "email", "role", "status", "joined_at"],
  Events: ["event_id", "group_id", "event_name", "start_date", "end_date", "base_currency", "created_by", "created_at", "updated_at"],
  Members: ["member_id", "event_id", "user_id", "name", "email", "role", "joined_at", "status"],
  Expenses: ["expense_id", "group_id", "event_id", "description", "category_id", "transaction_date", "payer_id", "amount_original", "currency_original", "exchange_rate", "amount_base", "base_currency", "receipt_file_id", "notes", "created_by", "created_at", "updated_at", "version", "record_type", "exchange_rate_source", "exchange_rate_date", "exchange_rate_provider", "reporting_currency", "base_to_reporting_rate", "amount_reporting", "reporting_rate_source", "reporting_rate_date", "reporting_rate_provider"],
  ExpenseSplits: ["expense_id", "member_id", "split_method", "owed_amount", "percentage", "shares"],
  DebtRecords: ["debt_record_id", "direction", "person_name", "amount", "currency", "date", "due_date", "note", "status", "created_by", "created_at", "updated_at", "name", "photo_file_ids", "photo_names"],
  Settlements: ["settlement_id", "from_member_id", "to_member_id", "amount", "currency", "date", "scope", "payment_method", "note", "created_by", "created_at"],
  SettlementEvents: ["settlement_id", "event_id", "allocated_amount"],
  Categories: ["category_id", "name", "emoji", "is_custom", "created_by"],
  EventExchangeRates: ["event_id", "from_currency", "to_currency", "rate", "rate_date", "rate_type"],
  GroupInvitations: ["invitation_id", "group_id", "invite_token_hash", "created_by", "approval_required", "default_role", "expires_at", "max_uses", "use_count", "is_active", "created_at", "revoked_at"],
  JoinRequests: ["join_request_id", "invitation_id", "group_id", "requester_user_id", "requester_email", "status", "requested_at", "reviewed_by", "reviewed_at", "assigned_role"],
  SyncLog: ["idempotency_key", "processed_at"],
} as const;

export type SheetName = keyof typeof GOOGLE_SHEET_HEADERS;

export const PERSONAL_SHEET_HEADERS = {
  UserSettings: GOOGLE_SHEET_HEADERS.UserSettings,
  Expenses: GOOGLE_SHEET_HEADERS.Expenses,
  ExpenseSplits: GOOGLE_SHEET_HEADERS.ExpenseSplits,
  DebtRecords: GOOGLE_SHEET_HEADERS.DebtRecords,
  Categories: GOOGLE_SHEET_HEADERS.Categories,
  SyncLog: GOOGLE_SHEET_HEADERS.SyncLog,
} as const;

export const GROUP_SHEET_HEADERS = {
  Groups: GOOGLE_SHEET_HEADERS.Groups,
  GroupMembers: GOOGLE_SHEET_HEADERS.GroupMembers,
  Events: GOOGLE_SHEET_HEADERS.Events,
  Members: GOOGLE_SHEET_HEADERS.Members,
  Expenses: GOOGLE_SHEET_HEADERS.Expenses,
  ExpenseSplits: GOOGLE_SHEET_HEADERS.ExpenseSplits,
  Settlements: GOOGLE_SHEET_HEADERS.Settlements,
  SettlementEvents: GOOGLE_SHEET_HEADERS.SettlementEvents,
  Categories: GOOGLE_SHEET_HEADERS.Categories,
  EventExchangeRates: GOOGLE_SHEET_HEADERS.EventExchangeRates,
  GroupInvitations: GOOGLE_SHEET_HEADERS.GroupInvitations,
  JoinRequests: GOOGLE_SHEET_HEADERS.JoinRequests,
  SyncLog: GOOGLE_SHEET_HEADERS.SyncLog,
} as const;

export type ScopedSheetHeaders = typeof PERSONAL_SHEET_HEADERS | typeof GROUP_SHEET_HEADERS;
