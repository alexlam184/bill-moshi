import { describe, expect, it } from "vitest";
import { seedSnapshot } from "./seed";
import { bindSnapshotIdentity } from "./identity";

describe("bindSnapshotIdentity", () => {
  it("transfers locally owned data to the first connected Google identity", () => {
    const bound = bindSnapshotIdentity(seedSnapshot, {
      id: "google:alex@example.com",
      name: "Alex",
      email: "alex@example.com",
      image: undefined,
    }, "user-tom");

    expect(bound.currentUser.id).toBe("google:alex@example.com");
    expect(bound.groups.every((group) => group.ownerId === "google:alex@example.com")).toBe(true);
    expect(bound.groupMembers.filter((member) => member.role === "owner").every((member) => (
      member.userId === "google:alex@example.com" && member.email === "alex@example.com"
    ))).toBe(true);
    expect(bound.events.every((event) => event.ownerId === "google:alex@example.com")).toBe(true);
    expect(bound.expenses.find((expense) => expense.id === "expense-personal-coffee")?.payerId).toBe("google:alex@example.com");
  });

  it("does not transfer ownership when no source identity is supplied", () => {
    const bound = bindSnapshotIdentity(seedSnapshot, {
      id: "google:viewer@example.com",
      name: "Viewer",
      email: "viewer@example.com",
      image: undefined,
    });

    expect(bound.groups[0].ownerId).toBe("user-tom");
    expect(bound.currentUser.id).toBe("google:viewer@example.com");
  });
});
