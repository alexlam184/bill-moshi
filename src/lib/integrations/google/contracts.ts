import type { AppSnapshot, PendingOperation } from "@/lib/domain/types";

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
  legacyWorkbookArchived: boolean;
}

export interface SyncResult {
  syncedOperationIds: string[];
  workspace: GoogleWorkspaceState;
}

export interface GoogleWorkspacePort {
  applyOperations(operations: PendingOperation[], snapshot?: AppSnapshot): Promise<SyncResult>;
  uploadReceipt(input: {
    scope: "personal" | "group";
    groupId?: string;
    groupName?: string;
    canCreateGroupWorkspace?: boolean;
    recordId: string;
    recordType?: "expense" | "debt_record";
    eventName: string;
    fileName: string;
    bytes: ArrayBuffer;
    mimeType: string;
  }): Promise<string>;
}
