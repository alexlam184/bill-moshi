import "server-only";
import type { RestorePreview, RestoreWorkspace } from "../../domain/restore";
import type { User } from "../../domain/types";
import { googleApiErrorMessage } from "./api-error";
import { GoogleApiRequestError } from "./server";
import { GROUP_SHEET_HEADERS, PERSONAL_SHEET_HEADERS, type SheetName } from "./sheet-schema";
import { parseRestoreWorkbook, type WorkbookTables } from "./restore-parser";

type BackupFile = { id: string; name: string; mimeType?: string; modifiedTime?: string; ownedByMe?: boolean; appProperties?: Record<string, string> };

// Intentionally separate from the write adapter: restore never ensures,
// creates, moves, shares, updates or deletes any Google file.
export class GoogleRestoreReader {
  constructor(private readonly accessToken: string, private readonly user: User) {}

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    if (!response.ok) throw new GoogleApiRequestError(response.status, googleApiErrorMessage(response.status, body));
    return JSON.parse(body) as T;
  }

  async list(): Promise<RestoreWorkspace[]> {
    const files: BackupFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: "trashed = false and ((mimeType = 'application/vnd.google-apps.spreadsheet' and appProperties has { key='billMoshiData' and value='true' }) or (mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='billMoshiWorkspaceType' and value='group' }))", spaces: "drive", pageSize: "100", fields: "nextPageToken,files(id,name,mimeType,modifiedTime,ownedByMe,appProperties)", orderBy: "modifiedTime desc" });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await this.get<{ files?: BackupFile[]; nextPageToken?: string }>(`https://www.googleapis.com/drive/v3/files?${params}`);
      files.push(...page.files ?? []);
      pageToken = page.nextPageToken;
      if (files.length > 1000) throw new Error("More than 1,000 backup sheets were found. Please contact support before restoring.");
    } while (pageToken);
    const groupNames = new Map(files.filter((file) => file.mimeType === "application/vnd.google-apps.folder").map((file) => [file.appProperties?.billMoshiGroupId, file.name]));
    return files.flatMap((file): RestoreWorkspace[] => {
      if (file.appProperties?.billMoshiData !== "true" || file.mimeType !== "application/vnd.google-apps.spreadsheet") return [];
      const kind = file.appProperties?.billMoshiWorkspaceType;
      if (file.appProperties?.billMoshiArchived === "true") return [];
      if (kind === "personal" && file.ownedByMe) return [{ id: file.id, name: "Personal", kind, modifiedAt: file.modifiedTime }];
      const groupId = file.appProperties?.billMoshiGroupId;
      if (kind === "group" && groupId) return [{ id: file.id, name: groupNames.get(groupId) ?? `Group · ${groupId}`, groupId, kind, modifiedAt: file.modifiedTime }];
      return [];
    });
  }

  async preview(workspaceIds: string[]): Promise<RestorePreview> {
    if (!workspaceIds.length || workspaceIds.length > 10 || new Set(workspaceIds).size !== workspaceIds.length) throw new Error("Choose between 1 and 10 different sheets.");
    // Re-discover on each preview, so arbitrary file IDs cannot bypass scope checks.
    const available = await this.list();
    const result: RestorePreview = { accountEmail: this.user.email, createdAt: new Date().toISOString(), backups: [], errors: [] };
    for (const id of workspaceIds) {
      const workspace = available.find((item) => item.id === id);
      if (!workspace) { result.errors.push("A selected sheet is no longer available to this account."); continue; }
      try {
        const workbook = await this.get<{ sheets?: Array<{ properties: { title: string } }> }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties(title)`);
        const allowed = workspace.kind === "personal" ? PERSONAL_SHEET_HEADERS : GROUP_SHEET_HEADERS;
        const names = (workbook.sheets ?? []).map((sheet) => sheet.properties.title).filter((title) => title in allowed && !["SyncLog", "GroupInvitations", "JoinRequests", "EventExchangeRates"].includes(title)) as SheetName[];
        if (!names.includes("Records") || (workspace.kind === "group" && !names.includes("RecordSplits"))) throw new Error(workspace.kind === "group" ? "Missing Records or RecordSplits worksheet." : "Missing Records worksheet.");
        const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
        for (const name of names) params.append("ranges", `'${name}'!A:AZ`);
        const values = await this.get<{ valueRanges?: Array<{ values?: unknown[][] }> }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet?${params}`);
        if (values.valueRanges?.length !== names.length) throw new Error("Google returned an incomplete workbook. Try again.");
        const tables: WorkbookTables = Object.fromEntries(names.map((name, index) => [name, values.valueRanges![index].values ?? []]));
        result.backups.push(parseRestoreWorkbook(workspace, tables, this.user));
      } catch (error) {
        // Authentication and quota errors apply to the whole attempt. Avoid
        // hammering other workbooks when Google asks the account to wait.
        if (error instanceof GoogleApiRequestError && [401, 429].includes(error.status)) throw error;
        result.errors.push(`${workspace.name}: ${error instanceof Error ? error.message : "Could not read this sheet."}`);
      }
    }
    return result;
  }
}
