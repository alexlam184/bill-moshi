import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Group, GroupInvitation } from "../domain/types";
import {
  authoritativeGroupOwner,
  confirmedGroupDeletions,
  invitationPreview,
  markGroupDeleted,
  pendingJoinRequests,
  registerInvitation,
  reviewStoredJoinRequest,
  submitJoinRequest,
} from "./store";

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "bill-moshi-collaboration-"));
  process.env.BILL_MOSHI_DATA_DIR = directory;
});

afterEach(async () => {
  delete process.env.BILL_MOSHI_DATA_DIR;
  await rm(directory, { recursive: true, force: true });
});

function fixture(id = crypto.randomUUID()) {
  const now = "2026-09-01T12:00:00.000Z";
  const group: Group = { id: `group-${id}`, name: "Moshi Family", emoji: "👨‍👩‍👧", currency: "CAD", ownerId: "google:owner@example.com", createdAt: now, updatedAt: now };
  const invitation: GroupInvitation = { id: `invite-${id}`, groupId: group.id, token: `token-${id}`, createdBy: group.ownerId, approvalRequired: true, defaultRole: "member", useCount: 0, isActive: true, createdAt: now };
  return { group, invitation };
}

describe("server-side collaboration registry", () => {
  it("moves an invitation request across users and persists owner review", async () => {
    const { group, invitation } = fixture();
    await authoritativeGroupOwner(group.id, group.name, "owner@example.com");
    await registerInvitation({ invitation, group, ownerEmail: "owner@example.com", ownerName: "Owner" });

    expect(await readFile(path.join(directory, "collaboration.json"), "utf8")).not.toContain(invitation.token);

    expect((await invitationPreview(invitation.token, "member@example.com"))?.group.id).toBe(group.id);
    const submitted = await submitJoinRequest({ token: invitation.token, requesterUserId: "google:member@example.com", requesterName: "Member", requesterEmail: "member@example.com" });
    expect(submitted.status).toBe("created");

    const pending = await pendingJoinRequests(group.id, "owner@example.com");
    expect(pending).toHaveLength(1);
    await reviewStoredJoinRequest({ requestId: pending[0].id, ownerEmail: "owner@example.com", ownerUserId: group.ownerId, decision: "approved", role: "member" });

    expect((await invitationPreview(invitation.token, "member@example.com"))?.requestStatus).toBe("approved");
  });

  it("keeps Group ownership immutable and distinguishes a confirmed deletion", async () => {
    const { group, invitation } = fixture();
    await authoritativeGroupOwner(group.id, group.name, "owner@example.com");
    await registerInvitation({ invitation, group, ownerEmail: "owner@example.com", ownerName: "Owner" });

    expect(await authoritativeGroupOwner(group.id, group.name, "attacker@example.com")).toBe("owner@example.com");
    expect(await confirmedGroupDeletions([group.id])).toEqual([]);

    await markGroupDeleted({ groupId: group.id, groupName: group.name, ownerEmail: "owner@example.com", deletedAt: "2026-09-01T15:00:00.000Z" });
    expect(await confirmedGroupDeletions([group.id])).toEqual([{ id: group.id, name: group.name, deletedAt: "2026-09-01T15:00:00.000Z" }]);
    expect(await invitationPreview(invitation.token, "member@example.com")).toBeUndefined();
  });

  it("does not let the first caller claim an unsynced Group through an invitation", async () => {
    const { group, invitation } = fixture();

    await expect(registerInvitation({ invitation, group, ownerEmail: "attacker@example.com", ownerName: "Attacker" }))
      .rejects.toThrow("Sync this Group to Google");

    await authoritativeGroupOwner(group.id, group.name, "owner@example.com");
    await expect(registerInvitation({ invitation, group, ownerEmail: "attacker@example.com", ownerName: "Attacker" }))
      .rejects.toThrow("Only the registered Group owner");
  });

  it("migrates a legacy raw invitation token to a digest on first read", async () => {
    const { group, invitation } = fixture();
    const file = path.join(directory, "collaboration.json");
    await writeFile(file, JSON.stringify({
      invitations: [{ invitation, group, ownerEmail: "owner@example.com", ownerName: "Owner" }],
      joinRequests: [], deletions: [],
      groups: [{ groupId: group.id, groupName: group.name, ownerEmail: "owner@example.com", registeredAt: invitation.createdAt }],
    }));

    expect((await invitationPreview(invitation.token, "member@example.com"))?.group.id).toBe(group.id);
    expect(await readFile(file, "utf8")).not.toContain(invitation.token);
  });
});
