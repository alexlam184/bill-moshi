import "server-only";

import { createHash } from "node:crypto";
import type { AppSnapshot, BillEvent, Category, DebtRecord, EventMember, Expense, Group, GroupInvitation, GroupMember, JoinRequest, PendingOperation, Settlement } from "@/lib/domain/types";
import { googleApiErrorMessage } from "./api-error";
import type { GoogleScopedWorkspaceState, GoogleWorkspacePort, SyncResult } from "./contracts";
import { driveFilesListUrl, driveGroupFolderQuery } from "./drive-query";
import { GROUP_SHEET_HEADERS, PERSONAL_SHEET_HEADERS, type ScopedSheetHeaders, type SheetName } from "./sheet-schema";
import { withGoogleWorkspaceAccountLock } from "./workspace-lock";
import { deletedGroupIdsInBatch, operationWorkspaceScope } from "./workspace-routing";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";

type DriveFile = {
  id: string;
  name?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  createdTime?: string;
};

type DrivePermission = {
  id: string;
  type: "user" | "group" | "domain" | "anyone";
  role: string;
  emailAddress?: string;
};

type EnsuredWorkspace = GoogleScopedWorkspaceState & { created: boolean; needsSeed: boolean };
type UploadReceiptInput = Parameters<GoogleWorkspacePort["uploadReceipt"]>[0];

export class GoogleApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiRequestError";
  }
}

export class GoogleWorkspaceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleWorkspaceAccessError";
  }
}

function canonicalFolder(files: DriveFile[]) {
  return files.toSorted((left, right) => {
    const leftCreated = left.createdTime ?? "9999";
    const rightCreated = right.createdTime ?? "9999";
    return leftCreated.localeCompare(rightCreated) || left.id.localeCompare(right.id);
  })[0];
}

function workbookHeaderSignature(headers: ScopedSheetHeaders) {
  return createHash("sha256").update(JSON.stringify(headers)).digest("hex").slice(0, 16);
}

export class GoogleWorkspaceAdapter implements GoogleWorkspacePort {
  private readonly sheetRowsCache = new Map<string, Promise<unknown[][]>>();
  private readonly pendingValueUpdates = new Map<string, Map<string, unknown[]>>();

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
    if (!response.ok) throw new GoogleApiRequestError(response.status, googleApiErrorMessage(response.status, body));
    return (body ? JSON.parse(body) : undefined) as T;
  }

  private async files(
    query: string,
    fields = "files(id,name,parents,appProperties)",
    orderBy?: string,
  ) {
    return (await this.request<{ files?: DriveFile[] }>(
      driveFilesListUrl({ apiBase: DRIVE_API, query, fields, orderBy }),
    )).files ?? [];
  }

  private async createFolder(name: string, parents: string[] | undefined, appProperties: Record<string, string>) {
    return this.request<DriveFile>(`${DRIVE_API}/files?fields=id,name,parents,appProperties,createdTime`, {
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

  private async canonicalRootFolder(candidates: DriveFile[]) {
    const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
    if (uniqueCandidates.length <= 1) return canonicalFolder(uniqueCandidates);

    const scored = await Promise.all(uniqueCandidates.map(async (candidate) => {
      const children = await this.files(
        `'${candidate.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      );
      const workspaceCount = children.filter((child) => {
        const type = child.appProperties?.billMoshiWorkspaceType;
        return type === "personal" || type === "group";
      }).length;
      return { candidate, workspaceCount };
    }));
    const highestWorkspaceCount = Math.max(...scored.map(({ workspaceCount }) => workspaceCount));
    return canonicalFolder(
      scored
        .filter(({ workspaceCount }) => workspaceCount === highestWorkspaceCount)
        .map(({ candidate }) => candidate),
    );
  }

  private async ensureRootFolder() {
    const rootQuery = "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='billMoshiRoot' and value='true' }";
    let candidates = await this.files(
      rootQuery,
      "files(id,name,parents,appProperties,createdTime)",
      "createdTime",
    );
    if (candidates.length === 0) {
      candidates = await this.files(
        "trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = 'Bill Moshi'",
        "files(id,name,parents,appProperties,createdTime)",
        "createdTime",
      );
    }

    let folder = await this.canonicalRootFolder(candidates);
    if (!folder) {
      const created = await this.createFolder("Bill Moshi", undefined, {
        billMoshiRoot: "true",
        billMoshiSchemaVersion: "2",
      });
      // Re-query after creation so separate server instances converge on the
      // same oldest folder if they happen to create concurrently.
      candidates = await this.files(
        rootQuery,
        "files(id,name,parents,appProperties,createdTime)",
        "createdTime",
      );
      folder = await this.canonicalRootFolder([...candidates, created]) ?? created;
    }

    if (
      folder.name !== "Bill Moshi"
      || folder.appProperties?.billMoshiRoot !== "true"
      || folder.appProperties?.billMoshiSchemaVersion !== "2"
    ) {
      await this.request(`${DRIVE_API}/files/${folder.id}?fields=id`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "Bill Moshi",
          appProperties: { billMoshiRoot: "true", billMoshiSchemaVersion: "2" },
        }),
      });
    }
    return folder.id;
  }

  private workspaceAccountKey() {
    const email = this.accountEmail?.trim().toLowerCase();
    return email || createHash("sha256").update(this.accessToken).digest("hex");
  }

  private async ensureChildFolder(
    parentId: string,
    name: string,
    markerKey: string,
    markerValue: string,
    appProperties: Record<string, string>,
  ) {
    const query = `'${parentId}' in parents and trashed = false and appProperties has { key='${markerKey}' and value='${markerValue}' }`;
    let candidates = await this.files(query, "files(id,name,parents,appProperties,createdTime)", "createdTime");
    let existing = canonicalFolder(candidates);
    if (existing) {
      if (existing.name !== name) {
        await this.request(`${DRIVE_API}/files/${existing.id}?fields=id`, { method: "PATCH", body: JSON.stringify({ name }) });
      }
      return { file: existing, created: false };
    }
    const created = await this.createFolder(name, [parentId], appProperties);
    candidates = await this.files(query, "files(id,name,parents,appProperties,createdTime)", "createdTime");
    existing = canonicalFolder([...candidates, created]) ?? created;
    return { file: existing, created: existing.id === created.id };
  }

  private async moveFile(fileId: string, targetParentId: string) {
    const file = await this.request<DriveFile>(`${DRIVE_API}/files/${fileId}?fields=id,parents`);
    if (file.parents?.length === 1 && file.parents[0] === targetParentId) return;
    const removeParents = (file.parents ?? []).filter((parent) => parent !== targetParentId).join(",");
    const query = new URLSearchParams({ addParents: targetParentId, fields: "id,parents" });
    if (removeParents) query.set("removeParents", removeParents);
    await this.request(`${DRIVE_API}/files/${fileId}?${query}`, { method: "PATCH", body: JSON.stringify({}) });
  }

  private async bestEffortFolderCleanup(task: () => Promise<void>) {
    try {
      await task();
      return true;
    } catch (error) {
      // A duplicate can contain a file that belongs to another group member.
      // It must not prevent the canonical workspace from syncing.
      if (error instanceof GoogleApiRequestError && (error.status === 403 || error.status === 404)) return false;
      throw error;
    }
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
    await this.writeWorkbookHeaders(spreadsheetId, headers);
  }

  private async writeWorkbookHeaders(spreadsheetId: string, headers: ScopedSheetHeaders) {
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
    const headerSignature = workbookHeaderSignature(headers);
    const existing = (await this.files(
      `'${folderId}' in parents and trashed = false and appProperties has { key='billMoshiData' and value='true' }`,
    ))[0];
    if (existing) {
      if (existing.name !== "Data") {
        await this.request(`${DRIVE_API}/files/${existing.id}?fields=id`, { method: "PATCH", body: JSON.stringify({ name: "Data" }) });
      }
      if (existing.appProperties?.billMoshiHeaderSignature !== headerSignature) {
        await this.configureWorkbook(existing.id, headers);
        await this.request(`${DRIVE_API}/files/${existing.id}?fields=id,appProperties`, {
          method: "PATCH",
          body: JSON.stringify({
            appProperties: {
              ...existing.appProperties,
              billMoshiHeaderSignature: headerSignature,
            },
          }),
        });
      }
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
    await this.writeWorkbookHeaders(workbook.spreadsheetId, headers);
    await this.request(`${DRIVE_API}/files/${workbook.spreadsheetId}?fields=id,appProperties`, {
      method: "PATCH",
      body: JSON.stringify({ appProperties: { billMoshiData: "true", billMoshiSchemaVersion: "2", billMoshiHeaderSignature: headerSignature, ...appProperties } }),
    });
    return { spreadsheetId: workbook.spreadsheetId, created: true, needsSeed: true };
  }

  private async ensurePersonalWorkspace(rootFolderId: string): Promise<EnsuredWorkspace> {
    const folder = await this.ensureChildFolder(rootFolderId, "Personal", "billMoshiWorkspaceType", "personal", {
      billMoshiWorkspaceType: "personal",
      billMoshiSchemaVersion: "2",
    });
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

  private async groupFolders(groupId: string, parentId?: string) {
    return this.files(
      driveGroupFolderQuery(groupId, parentId),
      "files(id,name,parents,appProperties,createdTime)",
      "createdTime",
    );
  }

  private canonicalGroupFolder(candidates: DriveFile[], preferredParentId?: string) {
    const active = candidates.filter((candidate) => candidate.appProperties?.billMoshiArchived !== "true");
    const preferred = preferredParentId
      ? active.filter((candidate) => candidate.parents?.includes(preferredParentId))
      : [];
    const pool = preferred.length > 0 ? preferred : active;
    const markedCanonical = pool.filter((candidate) => candidate.appProperties?.billMoshiCanonical === "true");
    return canonicalFolder(markedCanonical.length > 0 ? markedCanonical : pool);
  }

  private async findGroupFolder(groupId: string) {
    return this.canonicalGroupFolder(await this.groupFolders(groupId));
  }

  private async trashDuplicateGroupFolders(canonical: DriveFile, candidates: DriveFile[]) {
    const duplicates = candidates.filter((candidate) => candidate.id !== canonical.id);
    if (duplicates.length === 0) return;
    for (const duplicate of duplicates) {
      await this.bestEffortFolderCleanup(async () => {
        await this.request(`${DRIVE_API}/files/${duplicate.id}?fields=id,trashed`, {
          method: "PATCH",
          body: JSON.stringify({ trashed: true }),
        });
      });
    }
  }

  private async removeEmptyArchiveFolders(rootFolderId: string) {
    const archives = await this.files(
      `'${rootFolderId}' in parents and trashed = false and appProperties has { key='billMoshiArchive' and value='true' }`,
      "files(id)",
    );
    for (const archive of archives) {
      await this.bestEffortFolderCleanup(async () => {
        const children = await this.files(`'${archive.id}' in parents and trashed = false`, "files(id)");
        if (children.length === 0) {
          await this.request(`${DRIVE_API}/files/${archive.id}?fields=id,trashed`, {
            method: "PATCH",
            body: JSON.stringify({ trashed: true }),
          });
        }
      });
    }
  }

  private async ensureGroupWorkspace(
    rootFolderId: string,
    groupId: string,
    groupName: string,
    ownerId: string | undefined,
    allowCreate: boolean,
  ): Promise<EnsuredWorkspace> {
    let candidates = allowCreate
      ? await this.groupFolders(groupId, rootFolderId)
      : await this.groupFolders(groupId);
    let groupFolder = this.canonicalGroupFolder(candidates, allowCreate ? rootFolderId : undefined);
    if (allowCreate && !groupFolder) {
      candidates = await this.groupFolders(groupId);
      groupFolder = this.canonicalGroupFolder(candidates, rootFolderId);
    }
    let folderCreated = false;
    if (!groupFolder) {
      if (!allowCreate) throw new GoogleWorkspaceAccessError(`${groupName} storage has not been shared with this Google account yet.`);
      const created = await this.createFolder(groupName, [rootFolderId], {
        billMoshiWorkspaceType: "group",
        billMoshiGroupId: groupId,
        billMoshiOwnerId: ownerId ?? "",
        billMoshiSchemaVersion: "2",
        billMoshiCanonical: "true",
      });
      candidates = await this.groupFolders(groupId);
      const allCandidates = [...new Map([...candidates, created].map((candidate) => [candidate.id, candidate])).values()];
      groupFolder = this.canonicalGroupFolder(allCandidates, rootFolderId) ?? created;
      candidates = allCandidates;
      folderCreated = groupFolder.id === created.id;
    }

    if (allowCreate) {
      await this.bestEffortFolderCleanup(() => this.moveFile(groupFolder.id, rootFolderId));
      const appProperties = {
        ...groupFolder.appProperties,
        billMoshiWorkspaceType: "group",
        billMoshiGroupId: groupId,
        billMoshiOwnerId: ownerId ?? groupFolder.appProperties?.billMoshiOwnerId ?? "",
        billMoshiSchemaVersion: "2",
        billMoshiCanonical: "true",
      };
      if (groupFolder.name !== groupName || groupFolder.appProperties?.billMoshiCanonical !== "true") {
        await this.bestEffortFolderCleanup(async () => {
          await this.request(`${DRIVE_API}/files/${groupFolder.id}?fields=id,name,parents,appProperties`, {
            method: "PATCH",
            body: JSON.stringify({ name: groupName, appProperties }),
          });
        });
      }
      groupFolder = { ...groupFolder, name: groupName, parents: [rootFolderId], appProperties };
      candidates = await this.groupFolders(groupId);
      await this.trashDuplicateGroupFolders(groupFolder, candidates);
      await this.removeEmptyArchiveFolders(rootFolderId);
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

  private async sheetRows(spreadsheetId: string, sheet: SheetName) {
    const cacheKey = `${spreadsheetId}:${sheet}`;
    let rows = this.sheetRowsCache.get(cacheKey);
    if (!rows) {
      rows = this.values(spreadsheetId, `'${sheet}'!A:ZZ`).catch((error) => {
        this.sheetRowsCache.delete(cacheKey);
        throw error;
      });
      this.sheetRowsCache.set(cacheKey, rows);
    }
    return rows;
  }

  private async upsert(spreadsheetId: string, sheet: SheetName, row: unknown[], keyColumns = 1) {
    const rows = await this.sheetRows(spreadsheetId, sheet);
    const index = rows.findIndex((candidate, rowIndex) => rowIndex > 0 && candidate.slice(0, keyColumns).every((value, column) => String(value) === String(row[column])));
    const range = index >= 0 ? `'${sheet}'!A${index + 1}` : `'${sheet}'!A${rows.length + 1}`;
    const updates = this.pendingValueUpdates.get(spreadsheetId) ?? new Map<string, unknown[]>();
    updates.set(range, row);
    this.pendingValueUpdates.set(spreadsheetId, updates);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }

  private async flushValueUpdates(spreadsheetId?: string) {
    const workbookIds = spreadsheetId ? [spreadsheetId] : [...this.pendingValueUpdates.keys()];
    for (const workbookId of workbookIds) {
      const updates = this.pendingValueUpdates.get(workbookId);
      if (!updates?.size) continue;
      await this.request(`${SHEETS_API}/spreadsheets/${workbookId}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [...updates].map(([range, row]) => ({ range, values: [row] })),
        }),
      });
      this.pendingValueUpdates.delete(workbookId);
    }
  }

  private async alreadyApplied(spreadsheetId: string, key: string) {
    const rows = await this.sheetRows(spreadsheetId, "SyncLog");
    return rows.some((row) => row[0] === key);
  }

  private async clearByKey(spreadsheetId: string, sheet: SheetName, key: string, keyColumn = 0) {
    await this.clearByKeys(spreadsheetId, sheet, new Set([key]), keyColumn);
  }

  private async clearByKeys(spreadsheetId: string, sheet: SheetName, keys: ReadonlySet<string>, keyColumn = 0) {
    if (keys.size === 0) return;
    await this.flushValueUpdates(spreadsheetId);
    const rows = await this.sheetRows(spreadsheetId, sheet);
    const ranges = rows.flatMap((row, index) => index > 0 && keys.has(String(row[keyColumn])) ? [`'${sheet}'!A${index + 1}:ZZ${index + 1}`] : []);
    if (ranges.length === 0) return;
    await this.request(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchClear`, {
      method: "POST",
      body: JSON.stringify({ ranges }),
    });
    for (let index = 1; index < rows.length; index += 1) {
      if (keys.has(String(rows[index][keyColumn]))) rows[index] = [];
    }
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
        const expenseRows = await this.sheetRows(spreadsheetId, "Expenses");
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
    await this.flushValueUpdates(workspace.spreadsheetId);
    const headers = workspace.kind === "personal" ? PERSONAL_SHEET_HEADERS : GROUP_SHEET_HEADERS;
    const appProperties: Record<string, string> = {
      billMoshiData: "true",
      billMoshiSchemaVersion: "2",
      billMoshiHeaderSignature: workbookHeaderSignature(headers),
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
    let existing: DrivePermission[] = [];
    const canReadPermissions = await this.bestEffortFolderCleanup(async () => {
      existing = await this.permissions(workspace.folderId);
    });
    if (!canReadPermissions) return;
    for (const permission of existing) {
      if (permission.role === "owner") continue;
      const member = permission.emailAddress ? activeMembers.get(permission.emailAddress.toLowerCase()) : undefined;
      if (!member) {
        await this.bestEffortFolderCleanup(() => this.deletePermission(workspace.folderId, permission.id));
        continue;
      }
      const desiredRole = member.role === "viewer" ? "reader" : "writer";
      if (permission.role !== desiredRole) {
        await this.bestEffortFolderCleanup(async () => {
          await this.request(`${DRIVE_API}/files/${workspace.folderId}/permissions/${permission.id}?supportsAllDrives=true&fields=id`, {
            method: "PATCH",
            body: JSON.stringify({ role: desiredRole }),
          });
        });
      }
      activeMembers.delete(member.email.toLowerCase());
    }
    for (const member of activeMembers.values()) {
      await this.bestEffortFolderCleanup(async () => {
        await this.request(`${DRIVE_API}/files/${workspace.folderId}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id`, {
          method: "POST",
          body: JSON.stringify({ type: "user", role: member.role === "viewer" ? "reader" : "writer", emailAddress: member.email }),
        });
      });
    }
  }

  private async deleteGroupWorkspace(groupId: string, requestedBy: string) {
    const folder = await this.findGroupFolder(groupId);
    if (!folder) return;
    const workbook = (await this.files(`'${folder.id}' in parents and trashed = false and appProperties has { key='billMoshiData' and value='true' }`))[0];
    if (!workbook) throw new Error("The Group Data Sheet is missing; deletion stopped safely.");
    const groups = await this.sheetRows(workbook.id, "Groups");
    const groupRow = groups.find((row, index) => index > 0 && String(row[0]) === groupId);
    const members = await this.sheetRows(workbook.id, "GroupMembers");
    const ownerMember = members.find((row, index) => index > 0 && String(row[1]) === groupId && String(row[5]) === "owner");
    if (!groupRow || String(groupRow[4]) !== requestedBy || !ownerMember || String(ownerMember[4]).toLowerCase() !== this.accountEmail?.toLowerCase()) {
      throw new Error("Only the Group owner can delete its Google Drive folder.");
    }
    // A shared folder can contain child files owned by another member. Google
    // then refuses to trash the parent even though the group deletion itself
    // is valid. Do not let that legacy Drive cleanup block every other queued
    // expense; the owner can remove the remaining folder manually in Drive.
    await this.bestEffortFolderCleanup(async () => {
      await this.request(`${DRIVE_API}/files/${folder.id}?fields=id,trashed`, {
        method: "PATCH",
        body: JSON.stringify({ trashed: true }),
      });
    });
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
    return withGoogleWorkspaceAccountLock(
      this.workspaceAccountKey(),
      () => this.applyOperationsUnlocked(operations, snapshot),
    );
  }

  private async applyOperationsUnlocked(operations: PendingOperation[], snapshot?: AppSnapshot): Promise<SyncResult> {
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
    const deletedGroupIds = deletedGroupIdsInBatch(operations);
    const eventGroupIds = new Map(
      (snapshot?.events ?? []).map((event) => [event.id, event.groupId]),
    );
    for (const operation of operations.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const scope = operationWorkspaceScope(operation, eventGroupIds);
      const isGroupDelete = scope.kind === "group" && operation.entityType === "group" && operation.action === "delete";
      if (scope.kind === "group" && deletedGroupIds.has(scope.groupId) && !isGroupDelete) {
        // The group's final local state is deleted. Older queued writes for that
        // workspace (for example an invitation) are obsolete and must not try
        // to recreate or access a folder that has already been removed.
        syncedOperationIds.push(operation.id);
        continue;
      }
      if (isGroupDelete) {
        const payload = operation.payload as { requestedBy?: string };
        const deletedWorkspace = groups[scope.groupId];
        if (deletedWorkspace) this.pendingValueUpdates.delete(deletedWorkspace.spreadsheetId);
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

    await this.flushValueUpdates();
    const legacyWorkbookArchived = snapshot ? await this.archiveLegacyWorkbook(rootFolderId) : false;
    return {
      syncedOperationIds,
      workspace: { rootFolderId, personal, groups, legacyWorkbookArchived },
    };
  }

  async uploadReceipt(input: UploadReceiptInput): Promise<string> {
    return withGoogleWorkspaceAccountLock(
      this.workspaceAccountKey(),
      () => this.uploadReceiptUnlocked(input),
    );
  }

  private async uploadReceiptUnlocked(input: UploadReceiptInput): Promise<string> {
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
