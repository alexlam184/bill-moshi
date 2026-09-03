import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GoogleRestoreReader } from "./restore-reader";

const user = { id: "google:me@example.com", email: "me@example.com", name: "Me", defaultCurrency: "CAD" as const };
const file = { id: "personal-data", name: "Data", mimeType: "application/vnd.google-apps.spreadsheet", ownedByMe: true, appProperties: { billMoshiData: "true", billMoshiWorkspaceType: "personal" } };
afterEach(() => vi.unstubAllGlobals());

describe("read-only Google restore", () => {
  it("paginates discovery and excludes another person's private sheet", async () => {
    const fetchMock = vi.fn(async (url: string) => Response.json(new URL(url).searchParams.has("pageToken") ? { files: [file] } : { files: [{ ...file, id: "foreign", ownedByMe: false }], nextPageToken: "next" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new GoogleRestoreReader("token", user).list()).toEqual([expect.objectContaining({ id: file.id })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("batch reads worksheets without creating, updating, or deleting files", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.cache).toBe("no-store");
      if (url.includes("drive/v3/files")) return Response.json({ files: [file] });
      if (url.includes("values:batchGet")) return Response.json({ valueRanges: [{ values: [["record_id", "amount_original", "currency_original", "amount_base", "base_currency", "payer_id"]] }] });
      return Response.json({ sheets: [{ properties: { title: "Records" } }, { properties: { title: "SyncLog" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const preview = await new GoogleRestoreReader("token", user).preview([file.id]);
    expect(preview.backups).toHaveLength(1);
    expect(preview.errors).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain("valueRenderOption=UNFORMATTED_VALUE");
  });
  it("never reads arbitrary or no-longer-authorized workbook IDs", async () => {
    const fetchMock = vi.fn(async () => Response.json({ files: [] })); vi.stubGlobal("fetch", fetchMock);
    const result = await new GoogleRestoreReader("token", user).preview(["not-authorized"]);
    expect(result.backups).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
