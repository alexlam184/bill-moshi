import type { AppSnapshot, BillEvent, Category, EventMember, LedgerRecord, RecordSyncConflict, Group, GroupMember, PendingOperation } from "@/lib/domain/types";

export interface RemoteGroupState {
  group: Group;
  groupMembers: GroupMember[];
  events: BillEvent[];
  members: EventMember[];
  categories: Category[];
}

export interface GoogleScopedWorkspaceState {
  kind: "personal" | "group";
  folderId: string;
  spreadsheetId: string;
  uploadsFolderId: string;
  groupId?: string;
}

export interface GoogleWorkspaceState {
  rootFolderId: string;
  personal: GoogleScopedWorkspaceState;
  groups: Record<string, GoogleScopedWorkspaceState>;
}

export interface SyncResult {
  syncedOperationIds: string[];
  conflicts: RecordSyncConflict[];
  pulledGroupIds: string[];
  remoteRecords: LedgerRecord[];
  remoteGroupStates: RemoteGroupState[];
  unavailableGroups: Array<{ id: string; name: string }>;
  deletedGroups: Array<{ id: string; name: string; deletedAt: string }>;
  workspace: GoogleWorkspaceState;
}

export interface GoogleWorkspacePort {
  applyOperations(
    operations: PendingOperation[],
    snapshot?: AppSnapshot,
    options?: { allowRootCreation?: boolean },
  ): Promise<SyncResult>;
  uploadReceipt(input: {
    scope: "personal" | "group";
    groupId?: string;
    groupName?: string;
    canCreateGroupWorkspace?: boolean;
    recordId: string;
    recordType?: "expense" | "income" | "transfer" | "debt_record";
    eventName: string;
    fileName: string;
    bytes: ArrayBuffer;
    mimeType: string;
    allowRootCreation?: boolean;
  }): Promise<string>;
}
