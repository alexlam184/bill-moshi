import { describe, expect, it } from "vitest";
import { removeDeletedGroups } from "./group-lifecycle";
import { seedSnapshot } from "./seed";

describe("confirmed Group deletion cleanup", () => {
  it("removes only the deleted Group data and keeps a deletion notice", () => {
    const detectedAt = "2026-08-31T19:00:00.000Z";
    const result = removeDeletedGroups(
      structuredClone(seedSnapshot),
      [{ id: "group-family", name: "Moshi Family" }],
      detectedAt,
    );

    expect(result.groups.map((group) => group.id)).toEqual(["group-roommates"]);
    expect(result.groupMembers.every((member) => member.groupId !== "group-family")).toBe(true);
    expect(result.events.every((event) => event.groupId !== "group-family")).toBe(true);
    expect(result.members).toHaveLength(0);
    expect(result.records.map((record) => record.id)).toEqual(["expense-personal-coffee"]);
    expect(result.invitations).toHaveLength(0);
    expect(result.joinRequests).toHaveLength(0);
    expect(result.activity).toHaveLength(0);
    expect(result.groupDeletionNotices).toEqual([
      { groupId: "group-family", groupName: "Moshi Family", detectedAt },
    ]);
  });

  it("does not duplicate a notice after the Group is already gone", () => {
    const once = removeDeletedGroups(
      structuredClone(seedSnapshot),
      [{ id: "group-family", name: "Moshi Family" }],
      "2026-08-31T19:00:00.000Z",
    );
    const twice = removeDeletedGroups(
      once,
      [{ id: "group-family", name: "Moshi Family" }],
      "2026-08-31T20:00:00.000Z",
    );

    expect(twice.groupDeletionNotices).toEqual(once.groupDeletionNotices);
  });
});
