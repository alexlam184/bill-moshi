import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GoogleApiRequestError, GoogleWorkspaceAdapter } from "./server";
import type { SheetName } from "./sheet-schema";

type AdapterInternals = {
  upsert(spreadsheetId: string, sheet: SheetName, row: unknown[], keyColumns?: number): Promise<void>;
  flushValueUpdates(spreadsheetId?: string): Promise<void>;
  canonicalGroupFolder(candidates: Array<{
    id: string;
    parents?: string[];
    appProperties?: Record<string, string>;
    createdTime?: string;
  }>, preferredParentId?: string): { id: string } | undefined;
  bestEffortFolderCleanup(task: () => Promise<void>): Promise<boolean>;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleWorkspaceAdapter sheet reads", () => {
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
