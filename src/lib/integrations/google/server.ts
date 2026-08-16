import "server-only";

import { createHash } from "node:crypto";
import type { AppSnapshot, BillEvent, Category, DebtRecord, EventMember, Expense, Group, GroupInvitation, GroupMember, JoinRequest, PendingOperation, Settlement } from "@/lib/domain/types";
import type { GoogleScopedWorkspaceState, GoogleWorkspacePort, SyncResult } from "./contracts";
import { GROUP_SHEET_HEADERS, PERSONAL_SHEET_HEADERS, type ScopedSheetHeaders, type SheetName } from "./sheet-schema";
import { operationWorkspaceScope } from "./workspace-routing";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";

type DriveFile = {
  id: string;
  name?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
};

type DrivePermission = {
  id: string;
  type: "user" | "group" | "domain" | "anyone";
  role: string;
  emailAddress?: string;
};

type EnsuredWorkspace = GoogleScopedWorkspaceState & { created: boolean; needsSeed: boolean };

export class GoogleWorkspaceAdapter implements GoogleWorkspacePort {
  constructor(
    private readonly accessToken: string,
    private readonly accountEmail?: string,
  ) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Google API request failed (${response.status}): ${body}`);
    return (body ? JSON.parse(body) : undefined) as T;
  }

  private async files(query: string, fields = "files(id,name,parents,appProperties)") {
    return (await this.request<{ files?: DriveFile[] }>(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&spaces=drive`,
    )).files ?? [];
  }

  private async createFolder(name: string, parents: string[] | undefined, appProperties: Record<string, string>) {
    return this.request<DriveFile>(`${DRIVE_API}/files?fields=id,name,parents,appProperties`, {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents,
        appProperties,
      }),
    });
  }

  private async permissions(fileId: string) {
    return (await this.request<{ permissions?: DrivePermission[] }>(
      `${DRIVE_API}/files/${fileId}/permissions?fields=permissions(id,type,role,emailAddress)&supportsAllDrives=true`,
    )).permissions ?? [];
  }

  private async deletePermission(fileId: string, permissionId: string) {
    await this.request(`${DRIVE_API}/files/${fileId}/permissions/${permissionId}?supportsAllDrives=true`, { method: "DELETE" });
  }

  private async enforcePrivateFolder(folderId: string) {
    for (const permission of await this.permissions(folderId)) {
      if (permission.role !== "owner") await this.deletePermission(folderId, permission.id);
    }
  }

  private async ensureRootFolder() {
    const existing = (await this.files("trashed = false and appProperties has { key='billMoshiRoot' and value='true' }"))[0];
    const folder = existing ?? await this.createFolder("Bill Moshi", undefined, { billMoshiRoot: "true", billMoshiSchemaVersion: "2" });
    if (folder.name !== "Bill Moshi") {
      await this.request(`${DRIVE_API}/files/${folder.id}?fields=id`, { method: "PATCH", body: JSON.stringify({ name: "Bill Moshi" }) });
    }
    await this.enforcePrivateFolder(folder.id);
    return folder.id;
  }

  private async ensureChildFolder(
    parentId: string,
    name: string,
    markerKey: string,
    markerValue: string,
    appProperties: Record<string, string>,
  ) {
    const query = `'${parentId}' in parents and trashed = false and appProperties has { key='${markerKey}' and value='${markerValue}' }`;
    const existing = (await this.files(query))[0];
    if (existing) {
      if (existing.name !== name) {
        await this.request(`${DRIVE_API}/files/${existing.id}?fields=id`, { method: "PATCH", body: JSON.stringify({ name }) });
      }
      return { file: existing, created: false };
    }
    return { file: await this.createFolder(name, [parentId], appProperties), created: true };
  }

  private async moveFile(fileId: string, targetParentId: string) {
    const file = await this.request<DriveFile>(`${DRIVE_API}/files/${fileId}?fields=id,parents`);
    if (file.parents?.length === 1 && file.parents[0] === targetParentId) return;
    const removeParents = (file.parents ?? []).filter((parent) => parent !== targetParentId).join(",");
    const query = new URLSearchParams({ addParents: targetParentId, fields: "id,parents" });
    if (removeParents) query.set("removeParents", removeParents);
    await this.request(`${DRIVE_API}/files/${fileId}?${query}`, { method: "PATCH", body: JSON.stringify({}) });
  }

  private async configureWorkbook(spreadsheetId: string, headers: ScopedSheetHeaders) {
    const workbook = await this.request<{ sheets?: Array<{ properties: { title: string } }> }>(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties(title)`,
    );
    const existingTitles = new Set((workbook.sheets ?? []).map((sheet) => sheet.properties.title));
    const missingTitles = Object.keys(headers).filter((title) => !existingTitles.has(title));
    if (missingTitles.length > 0) {
      await this.request(`${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: missingTitles.map((title) => ({ addSheet: { properties: { title } } })) }),
      });
    }
    await this.request(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: Object.entries(headers).map(([sheet, row]) => ({ range: `'${sheet}'!A1`, values: [[...row]] })),
      }),
    });
  }

  private async ensureWorkbook(
    folderId: string,
    headers: ScopedSheetHeaders,
    appProperties: Record<string, string>,
  ) {
    const existing = (await this.files(
      `'${folderId}' in parents and trashed = false and appProperties has { key='billMoshiData' and value='true' }`,
    ))[0];
    if (existing) {
      if (existing.name !== "Data") {
        await this.request(`${DRIVE_API}/files/${existing.id}?fields=id`, { method: "PATCH", body: JSON.stringify({ name: "Data" }) });
      }
      await this.configureWorkbook(existing.id, headers);
      return { spreadsheetId: existing.id, created: false, needsSeed: existing.appProperties?.billMoshiSeeded !== "true" };
    }

    const workbook = await this.request<{ spreadsheetId: string }>(`${SHEETS_API}/spreadsheets`, {
      method: "POST",
      body: JSON.stringify({
        properties: { title: "Data" },
        sheets: Object.keys(headers).map((title) => ({ properties: { title } })),
      }),
    });
    await this.request(`${DRIVE_API}/files/${workbook.spreadsheetId}?fields=id,parents,appProperties`, {
      method: "PATCH",
      body: JSON.stringify({ appProperties: { billMoshiData: "true", billMoshiSchemaVersion: "2", ...appProperties } }),
    });
    await this.moveFile(workbook.spreadsheetId, folderId);
    await this.configureWorkbook(workbook.spreadsheetId, headers);
    return { spreadsheetId: workbook.spreadsheetId, created: true, needsSeed: true };
  }

  private async ensurePersonalWorkspace(rootFolderId: string): Promise<EnsuredWorkspace> {
    const folder = await this.ensureChildFolder(rootFolderId, "Personal", "billMoshiWorkspaceType", "personal", {
      billMoshiWorkspaceType: "personal",
      billMoshiSchemaVersion: "2",
    });
    await this.enforcePrivateFolder(folder.file.id);
    const uploads = await this.ensureChildFolder(folder.file.id, "Uploads", "billMoshiUploads", "true", {
      billMoshiUploads: "true",
      billMoshiWorkspaceType: "personal",
    });
    const workbook = await this.ensureWorkbook(folder.file.id, PERSONAL_SHEET_HEADERS, { billMoshiWorkspaceType: "personal" });
    return {
      kind: "personal",
      folderId: folder.file.id,
      spreadsheetId: workbook.spreadsheetId,
      uploadsFolderId: uploads.file.id,
      created: folder.created || workbook.created,
      needsSeed: workbook.needsSeed,
    };
  }

  private async findGroupFolder(groupId: string) {
    return (await this.files(
      `trashed = false and appProperties has { key='billMoshiWorkspaceType' and value='group' } and appProperties has { key='billMoshiGroupId' and value='${groupId}' }`,
    ))[0];
  }

  private async ensureGroupWorkspace(
    rootFolderId: string,
    groupId: string,
    groupName: string,
    ownerId: string | undefined,
    allowCreate: boolean,
  ): Promise<EnsuredWorkspace> {
    let groupFolder = await this.findGroupFolder(groupId);
    let folderCreated = false;
    if (!groupFolder) {
      if (!allowCreate) throw new Error(`${groupName} storage has not been shared with this Google account yet.`);
      groupFolder = await this.createFolder(groupName, [rootFolderId], {
        billMoshiWorkspaceType: "group",
        billMoshiGroupId: groupId,
        billMoshiOwnerId: ownerId ?? "",
        billMoshiSchemaVersion: "2",
      });
      folderCreated = true;
    } else if (groupFolder.name !== groupName) {
      await this.request(`${DRIVE_API}/files/${groupFolder.id}?fields=id`, { method: "PATCH", body: JSON.stringify({ name: groupName }) });
    }

    const uploads = await this.ensureChildFolder(groupFolder.id, "Uploads", "billMoshiUploads", "true", {
      billMoshiUploads: "true",
      billMoshiWorkspaceType: "group",
      billMoshiGroupId: groupId,
    });
    const workbook = await this.ensureWorkbook(groupFolder.id, GROUP_SHEET_HEADERS, {
      billMoshiWorkspaceType: "group",
      billMoshiGroupId: groupId,
    });
    return {
      kind: "group",
      groupId,
      folderId: groupFolder.id,
      spreadsheetId: workbook.spreadsheetId,
      uploadsFolderId: uploads.file.id,
      created: folderCreated || workbook.created,
      needsSeed: workbook.needsSeed,
    };
  }

  private async values(spreadsheetId: string, range: string) {
    const result = await this.request<{ values?: unknown[][] }>(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    );
    return result.values ?? [];
  }

  private async upsert(spreadsheetId: string, sheet: SheetName, row: unknown[], keyColumns = 1) {
    const rows = await this.values(spreadsheetId, `'${sheet}'!A:ZZ`);
    const index = rows.findIndex((candidate, rowIndex) => rowIndex > 0 && candidate.slice(0, keyColumns).every((value, column) => String(value) === String(row[column])));
    const range = index >= 0 ? `'${sheet}'!A${index + 1}` : `'${sheet}'!A${rows.length + 1}`;
    await this.request(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [row] }),
    });
  }

  private async alreadyApplied(spreadsheetId: string, key: string) {
    const rows = await this.values(spreadsheetId, "'SyncLog'!A:A");
    return rows.some((row) => row[0] === key);
  }

  private async clearByKey(spreadsheetId: string, sheet: SheetName, key: string, keyColumn = 0) {
    await this.clearByKeys(spreadsheetId, sheet, new Set([key]), keyColumn);
  }

  private async clearByKeys(spreadsheetId: string, sheet: SheetName, keys: ReadonlySet<string>, keyColumn = 0) {
    if (keys.size === 0) return;
    const rows = await this.values(spreadsheetId, `'${sheet}'!A:ZZ`);
    const ranges = rows.flatMap((row, index) => index > 0 && keys.has(String(row[keyColumn])) ? [`'${sheet}'!A${index + 1}:ZZ${index + 1}`] : []);
    if (ranges.length === 0) return;
    await this.request(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchClear`, {
      method: "POST",
      body: JSON.stringify({ ranges }),
    });
  }

  private async writeExpense(spreadsheetId: string, expense: Expense, category?: Category) {
    await this.upsert(spreadsheetId, "Expenses", [expense.id, expense.groupId ?? "", expense.eventId ?? "", expense.description, expense.categoryId, expense.transactionDate, expense.payerId, expense.amountOriginal, expense.currencyOriginal, expense.exchangeRate, expense.amountBase, expense.baseCurrency, expense.receiptFileId ?? "", expense.notes ?? "", expense.createdBy, expense.createdAt, expense.updatedAt, expense.version, expense.recordType, expense.exchangeRateSource, expense.exchangeRateDate ?? "", expense.exchangeRateProvider ?? "", expense.reportingCurrency ?? "", expense.baseToReportingRate ?? "", expense.amountReporting ?? "", expense.reportingRateSource ?? "", expense.reportingRateDate ?? "", expense.reportingRateProvider ?? ""]);
    for (const split of expense.splits) {
      await this.upsert(spreadsheetId, "ExpenseSplits", [expense.id, split.memberId, split.splitMethod, split.owedAmount, split.percentage ?? "", split.shares ?? ""], 2);
    }
    if (category) await this.upsert(spreadsheetId, "Categories", [category.id, category.name, category.emoji, category.isCustom, category.createdBy ?? ""]);
  }

  private async applyOperation(spreadsheetId: string, operation: PendingOperation) {
    const payload = operation.payload as Record<string, unknown>;
    if (operation.action === "delete") {
      if (operation.entityType === "event") {
        const expenseRows = await this.values(spreadsheetId, "'Expenses'!A:ZZ");
        const expenseIds = new Set(expenseRows.filter((row, index) => index > 0 && String(row[2]) === operation.entityId).map((row) => String(row[0])));
        await this.clearByKey(spreadsheetId, "Events", operation.entityId);
        await this.clearByKey(spreadsheetId, "Members", operation.entityId, 1);
        await this.clearByKey(spreadsheetId, "Expenses", operation.entityId, 2);
        await this.clearByKeys(spreadsheetId, "ExpenseSplits", expenseIds);
        await this.clearByKey(spreadsheetId, "SettlementEvents", operation.entityId, 1);
      } else if (operation.entityType === "expense") {
        await this.clearByKey(spreadsheetId, "Expenses", operation.entityId);
        await this.clearByKey(spreadsheetId, "ExpenseSplits", operation.entityId);
      } else if (operation.entityType === "debt_record") {
        await this.clearByKey(spreadsheetId, "DebtRecords", operation.entityId);
      }
      return;
    }

    if (operation.entityType === "user_settings") {
      const settings = payload.settings as { userId: string; email: string; defaultCurrency: string; updatedAt: string };
      await this.upsert(spreadsheetId, "UserSettings", [settings.userId, settings.email, settings.defaultCurrency, settings.updatedAt]);
    } else if (operation.entityType === "group") {
      const group = payload.group as Group;
      await this.upsert(spreadsheetId, "Groups", [group.id, group.name, group.emoji, group.description ?? "", group.ownerId, group.createdAt, group.updatedAt, group.notes ?? "", group.currency]);
      const groupMember = payload.groupMember as GroupMember | undefined;
      if (groupMember) await this.upsert(spreadsheetId, "GroupMembers", [groupMember.id, groupMember.groupId, groupMember.userId, groupMember.name, groupMember.email, groupMember.role, groupMember.status, groupMember.joinedAt]);
    } else if (operation.entityType === "group_member") {
      const groupMember = payload.groupMember as GroupMember;
      const eventMembers = (payload.eventMembers as EventMember[] | undefined) ?? [];
      await this.upsert(spreadsheetId, "GroupMembers", [groupMember.id, groupMember.groupId, groupMember.userId, groupMember.name, groupMember.email, groupMember.role, groupMember.status, groupMember.joinedAt]);
      for (const member of eventMembers) await this.upsert(spreadsheetId, "Members", [member.id, member.eventId, member.userId, member.name, member.email, member.role, member.joinedAt, member.status]);
    } else if (operation.entityType === "event") {
      const event = payload.event as BillEvent;
      const members = (payload.members as EventMember[] | undefined) ?? (payload.member ? [payload.member as EventMember] : []);
      await this.upsert(spreadsheetId, "Events", [event.id, event.groupId, event.name, event.startDate ?? "", event.endDate ?? "", event.baseCurrency, event.ownerId, event.createdAt, event.updatedAt]);
      for (const member of members) await this.upsert(spreadsheetId, "Members", [member.id, member.eventId, member.userId, member.name, member.email, member.role, member.joinedAt, member.status]);
    } else if (operation.entityType === "expense") {
      const eventMembers = (payload.eventMembers as EventMember[] | undefined) ?? [];
      for (const member of eventMembers) await this.upsert(spreadsheetId, "Members", [member.id, member.eventId, member.userId, member.name, member.email, member.role, member.joinedAt, member.status]);
      await this.writeExpense(spreadsheetId, payload.expense as Expense, payload.category as Category | undefined);
    } else if (operation.entityType === "debt_record") {
      const debtRecord = payload.debtRecord as DebtRecord;
      await this.upsert(spreadsheetId, "DebtRecords", [debtRecord.id, debtRecord.direction, debtRecord.personName, debtRecord.amount, debtRecord.currency, debtRecord.date, debtRecord.dueDate ?? "", debtRecord.note ?? "", debtRecord.status, debtRecord.createdBy, debtRecord.createdAt, debtRecord.updatedAt, debtRecord.name ?? "", JSON.stringify(Object.values(debtRecord.photoFileIds ?? {})), JSON.stringify(debtRecord.photoNames ?? [])]);
    } else if (operation.entityType === "settlement") {
      const settlement = payload.settlement as Settlement;
      await this.upsert(spreadsheetId, "Settlements", [settlement.id, settlement.fromMemberId, settlement.toMemberId, settlement.amount, settlement.currency, settlement.date, settlement.scope, settlement.paymentMethod, settlement.note ?? "", settlement.createdBy, settlement.createdAt]);
      for (const event of settlement.events) await this.upsert(spreadsheetId, "SettlementEvents", [settlement.id, event.eventId, event.allocatedAmount], 2);
    } else if (operation.entityType === "category") {
      const category = payload.category as Category;
      await this.upsert(spreadsheetId, "Categories", [category.id, category.name, category.emoji, category.isCustom, category.createdBy ?? ""]);
    } else if (operation.entityType === "invitation") {
      const invitation = payload.invitation as GroupInvitation;
      const tokenHash = createHash("sha256").update(invitation.token).digest("hex");
      await this.upsert(spreadsheetId, "GroupInvitations", [invitation.id, invitation.groupId, tokenHash, invitation.createdBy, invitation.approvalRequired, invitation.defaultRole, invitation.expiresAt ?? "", invitation.maxUses ?? "", invitation.useCount, invitation.isActive, invitation.createdAt, invitation.revokedAt ?? ""]);
    } else if (operation.entityType === "join_request") {
      const request = payload.request as JoinRequest;
      await this.upsert(spreadsheetId, "JoinRequests", [request.id, request.invitationId, request.groupId, request.requesterUserId, request.requesterEmail, request.status, request.requestedAt, request.reviewedBy ?? "", request.reviewedAt ?? "", request.assignedRole ?? ""]);
      const groupMember = payload.groupMember as GroupMember | undefined;
      if (groupMember) await this.upsert(spreadsheetId, "GroupMembers", [groupMember.id, groupMember.groupId, groupMember.userId, groupMember.name, groupMember.email, groupMember.role, groupMember.status, groupMember.joinedAt]);
      const eventMembers = (payload.eventMembers as EventMember[] | undefined) ?? [];
      for (const member of eventMembers) await this.upsert(spreadsheetId, "Members", [member.id, member.eventId, member.userId, member.name, member.email, member.role, member.joinedAt, member.status]);
    }
  }

  private syntheticOperation(entityType: PendingOperation["entityType"], entityId: string, payload: unknown): PendingOperation {
    return { id: `seed:${entityType}:${entityId}`, entityType, entityId, action: "upsert", payload, createdAt: new Date(0).toISOString(), attempts: 0, status: "pending", idempotencyKey: `seed:${entityType}:${entityId}` };
  }

  private async seedPersonalWorkspace(workspace: GoogleScopedWorkspaceState, snapshot: AppSnapshot) {
    await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("user_settings", snapshot.currentUser.id, {
      settings: { userId: snapshot.currentUser.id, email: snapshot.currentUser.email, defaultCurrency: snapshot.currentUser.defaultCurrency, updatedAt: new Date().toISOString() },
    }));
    for (const category of snapshot.categories) await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("category", category.id, { category }));
    for (const expense of snapshot.expenses.filter((item) => !item.groupId)) {
      const category = snapshot.categories.find((item) => item.id === expense.categoryId);
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("expense", expense.id, { expense, category }));
      await this.moveHistoricalReceipt(expense, workspace.uploadsFolderId);
    }
    for (const debtRecord of snapshot.debtRecords) await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("debt_record", debtRecord.id, { debtRecord }));
  }

  private async markWorkspaceSeeded(workspace: GoogleScopedWorkspaceState) {
    const appProperties: Record<string, string> = {
      billMoshiData: "true",
      billMoshiSchemaVersion: "2",
      billMoshiWorkspaceType: workspace.kind,
      billMoshiSeeded: "true",
    };
    if (workspace.groupId) appProperties.billMoshiGroupId = workspace.groupId;
    await this.request(`${DRIVE_API}/files/${workspace.spreadsheetId}?fields=id,appProperties`, {
      method: "PATCH",
      body: JSON.stringify({ appProperties }),
    });
  }

  private async seedGroupWorkspace(workspace: GoogleScopedWorkspaceState, snapshot: AppSnapshot, group: Group) {
    const owner = snapshot.groupMembers.find((member) => member.groupId === group.id && member.role === "owner");
    await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("group", group.id, { group, groupMember: owner }));
    for (const groupMember of snapshot.groupMembers.filter((member) => member.groupId === group.id)) {
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("group_member", groupMember.id, { groupMember }));
    }
    const events = snapshot.events.filter((event) => event.groupId === group.id);
    const eventIds = new Set(events.map((event) => event.id));
    for (const event of events) {
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("event", event.id, { event, members: snapshot.members.filter((member) => member.eventId === event.id) }));
    }
    const expenses = snapshot.expenses.filter((expense) => expense.groupId === group.id);
    for (const expense of expenses) {
      const category = snapshot.categories.find((item) => item.id === expense.categoryId);
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("expense", expense.id, { expense, category }));
      await this.moveHistoricalReceipt(expense, workspace.uploadsFolderId);
    }
    for (const settlement of snapshot.settlements.filter((item) => item.events.some((event) => eventIds.has(event.eventId)))) {
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("settlement", settlement.id, { settlement, groupId: group.id }));
    }
    for (const invitation of snapshot.invitations.filter((item) => item.groupId === group.id)) {
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("invitation", invitation.id, { invitation }));
    }
    for (const request of snapshot.joinRequests.filter((item) => item.groupId === group.id)) {
      await this.applyOperation(workspace.spreadsheetId, this.syntheticOperation("join_request", request.id, { request }));
    }
  }

  private async moveHistoricalReceipt(expense: Expense, uploadsFolderId: string) {
    if (!expense.receiptFileId) return;
    try {
      await this.moveFile(expense.receiptFileId, uploadsFolderId);
    } catch {
      // Preserve the existing Drive file id even when an old receipt is unavailable to this account.
    }
  }

  private isCurrentOwner(snapshot: AppSnapshot, group: Group) {
    if (group.ownerId === snapshot.currentUser.id) return true;
    return snapshot.groupMembers.some((member) => member.groupId === group.id && member.role === "owner" && member.status === "active" && member.email.toLowerCase() === this.accountEmail?.toLowerCase());
  }

  private async reconcileGroupPermissions(workspace: GoogleScopedWorkspaceState, snapshot: AppSnapshot, group: Group) {
    if (!this.isCurrentOwner(snapshot, group)) return;
    const activeMembers = new Map(snapshot.groupMembers
      .filter((member) => member.groupId === group.id && member.status === "active" && member.role !== "owner")
      .map((member) => [member.email.toLowerCase(), member]));
    const existing = await this.permissions(workspace.folderId);
    for (const permission of existing) {
      if (permission.role === "owner") continue;
      const member = permission.emailAddress ? activeMembers.get(permission.emailAddress.toLowerCase()) : undefined;
      if (!member) {
        await this.deletePermission(workspace.folderId, permission.id);
        continue;
      }
      const desiredRole = member.role === "viewer" ? "reader" : "writer";
      if (permission.role !== desiredRole) {
        await this.request(`${DRIVE_API}/files/${workspace.folderId}/permissions/${permission.id}?supportsAllDrives=true&fields=id`, {
          method: "PATCH",
          body: JSON.stringify({ role: desiredRole }),
        });
      }
      activeMembers.delete(member.email.toLowerCase());
    }
    for (const member of activeMembers.values()) {
      await this.request(`${DRIVE_API}/files/${workspace.folderId}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id`, {
        method: "POST",
        body: JSON.stringify({ type: "user", role: member.role === "viewer" ? "reader" : "writer", emailAddress: member.email }),
      });
    }
  }

  private async deleteGroupWorkspace(groupId: string, requestedBy: string) {
    const folder = await this.findGroupFolder(groupId);
    if (!folder) return;
    const workbook = (await this.files(`'${folder.id}' in parents and trashed = false and appProperties has { key='billMoshiData' and value='true' }`))[0];
    if (!workbook) throw new Error("The Group Data Sheet is missing; deletion stopped safely.");
    const groups = await this.values(workbook.id, "'Groups'!A:ZZ");
    const groupRow = groups.find((row, index) => index > 0 && String(row[0]) === groupId);
    const members = await this.values(workbook.id, "'GroupMembers'!A:ZZ");
    const ownerMember = members.find((row, index) => index > 0 && String(row[1]) === groupId && String(row[5]) === "owner");
    if (!groupRow || String(groupRow[4]) !== requestedBy || !ownerMember || String(ownerMember[4]).toLowerCase() !== this.accountEmail?.toLowerCase()) {
      throw new Error("Only the Group owner can delete its Google Drive folder.");
    }
    await this.request(`${DRIVE_API}/files/${folder.id}?fields=id,trashed`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
  }

  private async archiveLegacyWorkbook(rootFolderId: string) {
    const legacy = (await this.files(
      `'${rootFolderId}' in parents and trashed = false and appProperties has { key='billMoshiWorkbook' and value='true' }`,
    ))[0];
    if (!legacy) return false;
    await this.request(`${DRIVE_API}/files/${legacy.id}?fields=id,name,appProperties`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Legacy - Bill Moshi Data", appProperties: { billMoshiWorkbook: "legacy", billMoshiLegacy: "true" } }),
    });
    return true;
  }

  async applyOperations(operations: PendingOperation[], snapshot?: AppSnapshot): Promise<SyncResult> {
    const rootFolderId = await this.ensureRootFolder();
    const personal = await this.ensurePersonalWorkspace(rootFolderId);
    if (personal.needsSeed && snapshot) {
      await this.seedPersonalWorkspace(personal, snapshot);
      await this.markWorkspaceSeeded(personal);
      personal.needsSeed = false;
    }
    const groups: Record<string, GoogleScopedWorkspaceState> = {};

    if (snapshot) {
      for (const group of snapshot.groups) {
        const activeForAccount = snapshot.groupMembers.some((member) => member.groupId === group.id && member.status === "active" && (member.userId === snapshot.currentUser.id || member.email.toLowerCase() === this.accountEmail?.toLowerCase()));
        if (!activeForAccount) continue;
        const canCreate = this.isCurrentOwner(snapshot, group);
        if (!canCreate && !(await this.findGroupFolder(group.id))) continue;
        const workspace = await this.ensureGroupWorkspace(rootFolderId, group.id, group.name, group.ownerId, canCreate);
        groups[group.id] = workspace;
        if (workspace.needsSeed) {
          await this.seedGroupWorkspace(workspace, snapshot, group);
          await this.markWorkspaceSeeded(workspace);
          workspace.needsSeed = false;
        }
        await this.reconcileGroupPermissions(workspace, snapshot, group);
      }
    }

    const syncedOperationIds: string[] = [];
    for (const operation of operations.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const scope = operationWorkspaceScope(operation);
      if (scope.kind === "group" && operation.entityType === "group" && operation.action === "delete") {
        const payload = operation.payload as { requestedBy?: string };
        await this.deleteGroupWorkspace(scope.groupId, String(payload.requestedBy ?? ""));
        delete groups[scope.groupId];
        syncedOperationIds.push(operation.id);
        continue;
      }

      let workspace: GoogleScopedWorkspaceState = personal;
      if (scope.kind === "group") {
        const group = snapshot?.groups.find((item) => item.id === scope.groupId)
          ?? ((operation.payload as { group?: Group }).group);
        const groupName = group?.name ?? `Group ${scope.groupId.slice(-6)}`;
        const canCreate = Boolean(group && snapshot && this.isCurrentOwner(snapshot, group));
        workspace = groups[scope.groupId] ?? await this.ensureGroupWorkspace(rootFolderId, scope.groupId, groupName, group?.ownerId, canCreate);
        groups[scope.groupId] = workspace;
        if ((workspace as EnsuredWorkspace).needsSeed && snapshot && group) {
          await this.seedGroupWorkspace(workspace, snapshot, group);
          await this.markWorkspaceSeeded(workspace);
          (workspace as EnsuredWorkspace).needsSeed = false;
        }
      }

      if (!(await this.alreadyApplied(workspace.spreadsheetId, operation.idempotencyKey))) {
        await this.applyOperation(workspace.spreadsheetId, operation);
        await this.upsert(workspace.spreadsheetId, "SyncLog", [operation.idempotencyKey, new Date().toISOString()]);
      }
      syncedOperationIds.push(operation.id);
    }

    const legacyWorkbookArchived = snapshot ? await this.archiveLegacyWorkbook(rootFolderId) : false;
    return {
      syncedOperationIds,
      workspace: { rootFolderId, personal, groups, legacyWorkbookArchived },
    };
  }

  async uploadReceipt(input: {
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
  }) {
    const rootFolderId = await this.ensureRootFolder();
    const workspace = input.scope === "personal"
      ? await this.ensurePersonalWorkspace(rootFolderId)
      : await this.ensureGroupWorkspace(rootFolderId, required(input.groupId, "A Group id is required for a shared receipt."), input.groupName ?? "Group", undefined, Boolean(input.canCreateGroupWorkspace));
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
    const fileProperties: Record<string, string> = {
      billMoshiRecordId: input.recordId,
      billMoshiRecordType: input.recordType ?? "expense",
      billMoshiWorkspaceType: input.scope,
      billMoshiEvent: input.eventName,
    };
    if ((input.recordType ?? "expense") === "expense") fileProperties.billMoshiExpenseId = input.recordId;
    if (input.groupId) fileProperties.billMoshiGroupId = input.groupId;
    const metadata = {
      name: `${input.recordId}-${safeName}`,
      parents: [workspace.uploadsFolderId],
      appProperties: fileProperties,
    };
    const boundary = `bill-moshi-${crypto.randomUUID()}`;
    const encoder = new TextEncoder();
    const prefix = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`);
    const suffix = encoder.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(prefix.length + input.bytes.byteLength + suffix.length);
    body.set(prefix, 0);
    body.set(new Uint8Array(input.bytes), prefix.length);
    body.set(suffix, prefix.length + input.bytes.byteLength);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw new Error(`Receipt upload failed (${response.status}).`);
    return ((await response.json()) as { id: string }).id;
  }
}

function required(value: string | undefined, message: string) {
  if (!value) throw new Error(message);
  return value;
}
