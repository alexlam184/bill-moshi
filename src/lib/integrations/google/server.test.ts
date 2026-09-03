import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GoogleApiRequestError, GoogleRootFolderConfirmationRequiredError, GoogleWorkspaceAdapter } from "./server";
import { recordSyncFingerprint } from "../../domain/sync-conflicts";
import type { SheetName } from "./sheet-schema";
import { GROUP_SHEET_HEADERS, PERSONAL_SHEET_HEADERS } from "./sheet-schema";
import type { LedgerRecord, RecordSyncConflict, PendingOperation, RecurringPayment } from "../../domain/types";

type AdapterInternals = {
  ensureRootFolder(allowCreation?: boolean): Promise<string>;
  configureWorkbook(spreadsheetId: string, headers: typeof PERSONAL_SHEET_HEADERS): Promise<void>;
  writeRecord(spreadsheetId: string, record: LedgerRecord): Promise<void>;
  applyOperation(spreadsheetId: string, operation: PendingOperation): Promise<void>;
  upsert(spreadsheetId: string, sheet: SheetName, row: unknown[], keyColumns?: number): Promise<void>;
  flushValueUpdates(spreadsheetId?: string): Promise<void>;
  prefetchSheets(spreadsheetId: string, sheets: readonly SheetName[]): Promise<void>;
  canonicalGroupFolder(candidates: Array<{
    id: string;
    parents?: string[];
    appProperties?: Record<string, string>;
    createdTime?: string;
  }>, preferredParentId?: string): { id: string } | undefined;
  bestEffortFolderCleanup(task: () => Promise<void>): Promise<boolean>;
  factoryReset(): Promise<{ trashedRoots: number }>;
  recordConflict(spreadsheetId: string, operation: PendingOperation, groupId: string, allowForce?: boolean): Promise<RecordSyncConflict | undefined>;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleWorkspaceAdapter sheet reads", () => {
  it("creates current worksheets without migrating or deleting old worksheets", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      if (String(input).includes("sheets.properties")) {
        return Response.json({ sheets: [
          { properties: { title: "Expenses", sheetId: 1 } },
          { properties: { title: "ExpenseSplits", sheetId: 2 } },
        ] });
      }
      return new Response(null);
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("test-token") as unknown as AdapterInternals;

    await adapter.configureWorkbook("personal-data", PERSONAL_SHEET_HEADERS);

    const createRequest = JSON.parse(String(fetchMock.mock.calls.find(([input]) => String(input).endsWith(":batchUpdate"))?.[1]?.body));
    expect(createRequest.requests).toEqual(Object.keys(PERSONAL_SHEET_HEADERS).map((title) => ({ addSheet: { properties: { title } } })));
  });

  it("writes personal records without a RecordSplits row", async () => {
    expect(PERSONAL_SHEET_HEADERS).toHaveProperty("Records");
    expect(PERSONAL_SHEET_HEADERS).not.toHaveProperty("RecordSplits");
    expect(GROUP_SHEET_HEADERS).toHaveProperty("RecordSplits");
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => init?.method === "POST" ? new Response(null) : Response.json({ values: [["record_id"]] }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("test-token") as unknown as AdapterInternals;
    const personalRecord: LedgerRecord = {
      id: "record-personal", recordType: "income", description: "Refund", categoryId: "other", transactionDate: "2026-08-31T12:00:00.000Z", payerId: "me", amountOriginal: 25, currencyOriginal: "CAD", exchangeRate: 1, amountBase: 25, baseCurrency: "CAD", exchangeRateSource: "same-currency", createdBy: "me", createdAt: "2026-08-31T12:00:00.000Z", updatedAt: "2026-08-31T12:00:00.000Z", version: 1, syncStatus: "pending", splits: [{ recordId: "record-personal", memberId: "me", splitMethod: "equal", owedAmount: 25 }],
    };

    await adapter.writeRecord("personal-data", personalRecord);
    await adapter.flushValueUpdates("personal-data");

    const update = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
    expect(update.data).toEqual([expect.objectContaining({ range: "'Records'!A2" })]);
  });

  it("stores recurring schedules only in Personal and ignores stale schedule versions", async () => {
    expect(PERSONAL_SHEET_HEADERS).toHaveProperty("RecurringPayments");
    expect(GROUP_SHEET_HEADERS).not.toHaveProperty("RecurringPayments");
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => init?.method === "POST" ? new Response(null) : Response.json({ values: [PERSONAL_SHEET_HEADERS.RecurringPayments] }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("test-token") as unknown as AdapterInternals;
    const payment: RecurringPayment = { id: "recurring-internet", name: "Internet", amount: 60, currency: "CAD", categoryId: "bills", frequency: "month", interval: 1, startDate: "2026-08-31", nextOccurrence: 1, status: "paused", createdAt: "2026-08-31", updatedAt: "2026-08-31", createdBy: "me", syncStatus: "pending", version: 3 };
    const operation: PendingOperation = { id: "op", idempotencyKey: "op", entityType: "recurring_payment", entityId: payment.id, payload: { recurringPayment: payment }, action: "upsert", attempts: 0, status: "pending", createdAt: "2026-08-31" };
    await adapter.applyOperation("personal-data", operation);
    await adapter.applyOperation("personal-data", { ...operation, payload: { recurringPayment: { ...payment, version: 2, status: "active" } } });
    await adapter.flushValueUpdates();
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
    expect(body.data[0].range).toBe("'RecurringPayments'!A2");
    expect(body.data[0].values[0][10]).toBe("paused");
    expect(body.data[0].values[0][15]).toBe(3);
  });
  it("reuses one worksheet read across multiple row upserts in the same sync batch", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 200 });
      return Response.json({ values: [["category_id", "name"], ["category-1", "Food"]] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await adapter.upsert("spreadsheet-1", "Categories", ["category-1", "Dining"]);
    await adapter.upsert("spreadsheet-1", "Categories", ["category-2", "Travel"]);
    await adapter.flushValueUpdates();

    const readCalls = fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === "GET");
    const writeCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(readCalls).toHaveLength(1);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(String(writeCalls[0][1]?.body))).toMatchObject({
      data: [
        { range: "'Categories'!A2", values: [["category-1", "Dining"]] },
        { range: "'Categories'!A3", values: [["category-2", "Travel"]] },
      ],
    });
  });

  it("prefetches multiple worksheet ranges with one Sheets request", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 200 });
      expect(String(input)).toContain("values:batchGet");
      return Response.json({ valueRanges: [
        { values: [["category_id", "name"]] },
        { values: [["idempotency_key", "processed_at"]] },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await adapter.prefetchSheets("spreadsheet-1", ["Categories", "SyncLog"]);
    await adapter.upsert("spreadsheet-1", "Categories", ["category-1", "Food"]);
    await adapter.upsert("spreadsheet-1", "SyncLog", ["operation-1", "2026-09-01T12:00:00.000Z"]);
    await adapter.flushValueUpdates();

    const readCalls = fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === "GET");
    expect(readCalls).toHaveLength(1);
    expect(String(readCalls[0][0])).toContain("ranges=%27Categories%27%21A%3AZZ");
    expect(String(readCalls[0][0])).toContain("ranges=%27SyncLog%27%21A%3AZZ");
  });
});

describe("GoogleWorkspaceAdapter group folders", () => {
  it("uses the active canonical folder under the Bill Moshi root", () => {
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;
    const selected = adapter.canonicalGroupFolder([
      { id: "archived", parents: ["root"], appProperties: { billMoshiArchived: "true" }, createdTime: "2026-01-01" },
      { id: "outside", parents: ["old-root"], appProperties: { billMoshiCanonical: "true" }, createdTime: "2026-01-02" },
      { id: "current", parents: ["root"], appProperties: { billMoshiCanonical: "true" }, createdTime: "2026-01-03" },
    ], "root");

    expect(selected?.id).toBe("current");
  });

  it("does not let a denied maintenance operation block data sync", async () => {
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await expect(adapter.bestEffortFolderCleanup(async () => {
      throw new GoogleApiRequestError(403, "Cannot update every child file.");
    })).resolves.toBe(false);
  });
});

describe("GoogleWorkspaceAdapter root folder confirmation", () => {
  it("does not create a Bill Moshi folder before the user confirms", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ files: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await expect(adapter.ensureRootFolder()).rejects.toBeInstanceOf(GoogleRootFolderConfirmationRequiredError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("creates exactly one marked root after confirmation", async () => {
    let listCount = 0;
    const root = { id: "root-new", name: "Bill Moshi", appProperties: { billMoshiRoot: "true", billMoshiSchemaVersion: "2" }, createdTime: "2026-08-31T20:00:00.000Z" };
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(root);
      listCount += 1;
      return Response.json({ files: listCount < 3 ? [] : [root] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await expect(adapter.ensureRootFolder(true)).resolves.toBe("root-new");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

describe("GoogleWorkspaceAdapter factory reset", () => {
  it("moves only explicitly marked Bill Moshi roots to Google Drive Trash", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json({ id: "root", trashed: true });
      return Response.json({ files: [{ id: "root-1", name: "Bill Moshi" }, { id: "root-2", name: "Bill Moshi" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await expect(adapter.factoryReset()).resolves.toEqual({ trashedRoots: 2 });

    const listCall = fetchMock.mock.calls.find(([, init]) => !init?.method || init.method === "GET");
    expect(String(listCall?.[0])).toContain("billMoshiRoot");
    expect(String(listCall?.[0])).not.toContain("name%3D%27Bill%20Moshi%27");
    const trashCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(trashCalls).toHaveLength(2);
    expect(trashCalls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([{ trashed: true }, { trashed: true }]);
  });

  it("does not mutate Drive when no marked root exists", async () => {
    const fetchMock = vi.fn(async () => Response.json({ files: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;

    await expect(adapter.factoryReset()).resolves.toEqual({ trashedRoots: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("GoogleWorkspaceAdapter multi-user conflicts", () => {
  it("stops a stale phone edit when the shared row changed", async () => {
    const base: LedgerRecord = { id: "expense-1", groupId: "group-1", recordType: "expense", description: "Dinner", categoryId: "food", transactionDate: "2026-08-31T20:00:00.000Z", payerId: "user-a", amountOriginal: 30, currencyOriginal: "CAD", exchangeRate: 1, amountBase: 30, baseCurrency: "CAD", exchangeRateSource: "same-currency", createdBy: "user-a", createdAt: "2026-08-31T20:00:00.000Z", updatedAt: "2026-08-31T20:00:00.000Z", version: 1, syncStatus: "synced", splits: [{ recordId: "expense-1", memberId: "user-a", splitMethod: "equal", owedAmount: 30 }] };
    const remoteRow = ["expense-1", "group-1", "", "Dinner changed by B", "food", base.transactionDate, "user-a", 30, "CAD", 1, 30, "CAD", "", "", "user-a", base.createdAt, "2026-08-31T21:00:00.000Z", 2, "expense", "same-currency"];
    const fetchMock = vi.fn(async (input: string | URL | Request) => Response.json(String(input).includes("RecordSplits")
      ? { values: [["record_id", "member_id", "split_method", "owed_amount"], ["expense-1", "user-a", "equal", 30]] }
      : { values: [["record_id"], remoteRow] }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GoogleWorkspaceAdapter("access-token") as unknown as AdapterInternals;
    const local = { ...base, description: "Dinner changed by A", updatedAt: "2026-08-31T22:00:00.000Z", version: 2, syncStatus: "pending" as const };
    const operation: PendingOperation = { id: "operation-1", idempotencyKey: "operation-1", entityType: "record", entityId: local.id, action: "upsert", payload: { record: local, baseVersion: 1, baseFingerprint: recordSyncFingerprint(base) }, createdAt: local.updatedAt, attempts: 0, status: "pending" };

    await expect(adapter.recordConflict("sheet-1", operation, "group-1")).resolves.toMatchObject({ entityId: "expense-1", groupId: "group-1", localAction: "upsert", localVersion: 2, remoteVersion: 2, reason: "remote-changed", remoteRecord: { description: "Dinner changed by B" } });
    const forced = { ...operation, payload: { ...(operation.payload as object), force: true } };
    await expect(adapter.recordConflict("sheet-1", forced, "group-1", false)).resolves.toMatchObject({ reason: "owner-required" });
    await expect(adapter.recordConflict("sheet-1", forced, "group-1", true)).resolves.toBeUndefined();
  });
});
