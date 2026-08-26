import { describe, expect, it } from "vitest";
import { driveFilesListUrl, driveGroupFolderQuery } from "./drive-query";

describe("driveFilesListUrl", () => {
  it("uses Drive's implicit ascending order without an invalid asc modifier", () => {
    const url = new URL(driveFilesListUrl({
      apiBase: "https://www.googleapis.com/drive/v3",
      query: "trashed = false",
      fields: "files(id,createdTime)",
      orderBy: "createdTime asc",
    }));

    expect(url.searchParams.get("orderBy")).toBe("createdTime");
    expect(url.searchParams.get("q")).toBe("trashed = false");
  });

  it("preserves Drive's supported descending modifier", () => {
    const url = new URL(driveFilesListUrl({
      apiBase: "https://www.googleapis.com/drive/v3",
      query: "trashed = false",
      fields: "files(id,createdTime)",
      orderBy: "createdTime desc",
    }));

    expect(url.searchParams.get("orderBy")).toBe("createdTime desc");
  });

  it("cannot mistake a group Data spreadsheet for its folder", () => {
    const query = driveGroupFolderQuery("group-family", "bill-moshi-root");

    expect(query).toContain("mimeType = 'application/vnd.google-apps.folder'");
    expect(query).toContain("value='group-family'");
    expect(query).toContain("'bill-moshi-root' in parents");
  });

  it("escapes identifiers before adding them to a Drive query", () => {
    const query = driveGroupFolderQuery("group'family", "root\\folder");

    expect(query).toContain("value='group\\'family'");
    expect(query).toContain("'root\\\\folder' in parents");
  });
});
