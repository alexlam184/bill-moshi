import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { Group, GroupInvitation, JoinRequest, MemberRole } from "@/lib/domain/types";

export interface InvitationPreview {
  invitationId: string;
  group: Pick<Group, "id" | "name" | "emoji" | "description" | "currency" | "ownerId" | "createdAt" | "updatedAt">;
  ownerName: string;
  approvalRequired: boolean;
  defaultRole: Exclude<MemberRole, "owner">;
  expiresAt?: string;
  requestStatus?: JoinRequest["status"];
}

interface StoredInvitation {
  invitation: Omit<GroupInvitation, "token">;
  tokenHash: string;
  group: InvitationPreview["group"];
  ownerEmail: string;
  ownerName: string;
}

interface GroupDeletionTombstone {
  groupId: string;
  groupName: string;
  ownerEmail: string;
  deletedAt: string;
}

interface GroupAuthority {
  groupId: string;
  groupName: string;
  ownerEmail: string;
  registeredAt: string;
}

interface CollaborationData {
  invitations: StoredInvitation[];
  joinRequests: JoinRequest[];
  deletions: GroupDeletionTombstone[];
  groups: GroupAuthority[];
}

const emptyData = (): CollaborationData => ({ invitations: [], joinRequests: [], deletions: [], groups: [] });
let transaction = Promise.resolve();

function storageFile() {
  const directory = process.env.BILL_MOSHI_DATA_DIR || path.join(process.cwd(), ".bill-moshi-data");
  return path.join(directory, "collaboration.json");
}

async function readData() {
  try {
    const parsed = JSON.parse(await readFile(storageFile(), "utf8")) as Partial<CollaborationData>;
    let migratedInvitationToken = false;
    const invitations = Array.isArray(parsed.invitations) ? parsed.invitations.flatMap((stored) => {
      const legacy = stored as StoredInvitation & { invitation?: GroupInvitation; tokenHash?: string };
      if (!legacy.invitation) return [];
      const { token, ...invitation } = legacy.invitation;
      if (token && !legacy.tokenHash) migratedInvitationToken = true;
      const tokenHash = legacy.tokenHash || (token ? invitationTokenHash(token) : "");
      return tokenHash ? [{ ...legacy, invitation, tokenHash } satisfies StoredInvitation] : [];
    }) : [];
    const data = {
      invitations,
      joinRequests: Array.isArray(parsed.joinRequests) ? parsed.joinRequests : [],
      deletions: Array.isArray(parsed.deletions) ? parsed.deletions : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
    if (migratedInvitationToken) await writeData(data);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
    throw error;
  }
}

async function writeData(data: CollaborationData) {
  const file = storageFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function mutate<T>(change: (data: CollaborationData) => T | Promise<T>) {
  const result = transaction.then(async () => {
    const data = await readData();
    const value = await change(data);
    await writeData(data);
    return value;
  });
  transaction = result.then(() => undefined, () => undefined);
  return result;
}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function activeInvitation(record: StoredInvitation | undefined) {
  if (!record?.invitation.isActive) return false;
  if (record.invitation.expiresAt && Date.parse(record.invitation.expiresAt) <= Date.now()) return false;
  return !record.invitation.maxUses || record.invitation.useCount < record.invitation.maxUses;
}

function previewFor(record: StoredInvitation, requesterEmail?: string, requests: JoinRequest[] = []): InvitationPreview {
  const request = requesterEmail
    ? requests.find((item) => item.invitationId === record.invitation.id && normalizedEmail(item.requesterEmail) === normalizedEmail(requesterEmail))
    : undefined;
  return {
    invitationId: record.invitation.id,
    group: record.group,
    ownerName: record.ownerName,
    approvalRequired: record.invitation.approvalRequired,
    defaultRole: record.invitation.defaultRole,
    expiresAt: record.invitation.expiresAt,
    requestStatus: request?.status,
  };
}

export async function registerInvitation(input: { invitation: GroupInvitation; group: StoredInvitation["group"]; ownerEmail: string; ownerName: string }) {
  return mutate((data) => {
    const email = normalizedEmail(input.ownerEmail);
    const authority = data.groups.find((item) => item.groupId === input.group.id);
    if (!authority) throw new Error("Sync this Group to Google before creating an invitation.");
    if (authority.ownerEmail !== email) throw new Error("Only the registered Group owner can create an invitation.");
    data.invitations = data.invitations.map((record) => record.group.id === input.group.id && normalizedEmail(record.ownerEmail) === email
      ? { ...record, invitation: { ...record.invitation, isActive: false, revokedAt: new Date().toISOString() } }
      : record);
    const { token, ...invitation } = input.invitation;
    data.invitations.push({ invitation, tokenHash: invitationTokenHash(token), group: input.group, ownerEmail: email, ownerName: input.ownerName });
    return previewFor(data.invitations.at(-1)!);
  });
}

export async function authoritativeGroupOwner(groupId: string, groupName: string, candidateOwnerEmail?: string) {
  return mutate((data) => {
    const existing = data.groups.find((item) => item.groupId === groupId);
    if (existing) return existing.ownerEmail;
    if (!candidateOwnerEmail) return undefined;
    const ownerEmail = normalizedEmail(candidateOwnerEmail);
    data.groups.push({ groupId, groupName, ownerEmail, registeredAt: new Date().toISOString() });
    return ownerEmail;
  });
}

export async function revokeStoredInvitation(invitationId: string, ownerEmail: string) {
  return mutate((data) => {
    const record = data.invitations.find((item) => item.invitation.id === invitationId && normalizedEmail(item.ownerEmail) === normalizedEmail(ownerEmail));
    if (!record) throw new Error("Invitation not found for this Group owner.");
    record.invitation.isActive = false;
    record.invitation.revokedAt = new Date().toISOString();
  });
}

export async function invitationPreview(token: string, requesterEmail?: string) {
  await transaction;
  const data = await readData();
  const tokenHash = invitationTokenHash(token);
  const record = data.invitations.find((item) => item.tokenHash === tokenHash);
  return activeInvitation(record) && record ? previewFor(record, requesterEmail, data.joinRequests) : undefined;
}

export async function submitJoinRequest(input: { token: string; requesterUserId: string; requesterName: string; requesterEmail: string }) {
  return mutate((data) => {
    const tokenHash = invitationTokenHash(input.token);
    const record = data.invitations.find((item) => item.tokenHash === tokenHash);
    if (!activeInvitation(record) || !record) return { status: "invalid" as const };
    const existing = data.joinRequests.find((item) => item.invitationId === record.invitation.id && normalizedEmail(item.requesterEmail) === normalizedEmail(input.requesterEmail));
    if (existing) return { status: existing.status === "approved" ? "approved" as const : "duplicate" as const, preview: previewFor(record, input.requesterEmail, data.joinRequests), request: existing };
    const requestedAt = new Date().toISOString();
    const request: JoinRequest = {
      id: randomUUID(),
      invitationId: record.invitation.id,
      groupId: record.group.id,
      requesterUserId: input.requesterUserId,
      requesterName: input.requesterName,
      requesterEmail: normalizedEmail(input.requesterEmail),
      status: record.invitation.approvalRequired ? "pending" : "approved",
      requestedAt,
      assignedRole: record.invitation.approvalRequired ? undefined : record.invitation.defaultRole,
    };
    data.joinRequests.push(request);
    record.invitation.useCount += 1;
    return { status: request.status === "approved" ? "approved" as const : "created" as const, preview: previewFor(record, input.requesterEmail, data.joinRequests), request };
  });
}

export async function pendingJoinRequests(groupId: string, ownerEmail: string) {
  await transaction;
  const data = await readData();
  const ownsGroup = data.groups.some((item) => item.groupId === groupId && item.ownerEmail === normalizedEmail(ownerEmail));
  if (!ownsGroup) throw new Error("Only the Group owner can read join requests.");
  return data.joinRequests.filter((request) => request.groupId === groupId && request.status === "pending");
}

export async function reviewStoredJoinRequest(input: { requestId: string; ownerEmail: string; ownerUserId: string; decision: "approved" | "rejected"; role: Exclude<MemberRole, "owner"> }) {
  return mutate((data) => {
    const request = data.joinRequests.find((item) => item.id === input.requestId);
    const invitation = request ? data.invitations.find((item) => item.invitation.id === request.invitationId) : undefined;
    const authority = request ? data.groups.find((item) => item.groupId === request.groupId) : undefined;
    if (!request || !invitation || !authority || authority.ownerEmail !== normalizedEmail(input.ownerEmail)) throw new Error("Only the Group owner can review this request.");
    if (request.status !== "pending") return request;
    request.status = input.decision;
    request.assignedRole = input.decision === "approved" ? input.role : undefined;
    request.reviewedBy = input.ownerUserId;
    request.reviewedAt = new Date().toISOString();
    return request;
  });
}

export async function markGroupDeleted(input: Omit<GroupDeletionTombstone, "deletedAt"> & { deletedAt?: string }) {
  return mutate((data) => {
    const ownerEmail = normalizedEmail(input.ownerEmail);
    const authority = data.groups.find((item) => item.groupId === input.groupId);
    if (!authority || authority.ownerEmail !== ownerEmail) throw new Error("Only the registered Group owner can confirm this deletion.");
    const tombstone = { ...input, ownerEmail, deletedAt: input.deletedAt ?? new Date().toISOString() };
    data.deletions = [...data.deletions.filter((item) => item.groupId !== input.groupId), tombstone];
    data.invitations = data.invitations.map((item) => item.group.id === input.groupId ? { ...item, invitation: { ...item.invitation, isActive: false, revokedAt: tombstone.deletedAt } } : item);
    return tombstone;
  });
}

export async function confirmedGroupDeletions(groupIds: string[]) {
  await transaction;
  const data = await readData();
  const ids = new Set(groupIds);
  return data.deletions.filter((item) => ids.has(item.groupId)).map(({ groupId, groupName, deletedAt }) => ({ id: groupId, name: groupName, deletedAt }));
}

export async function markOwnedGroupsDeleted(ownerEmail: string) {
  return mutate((data) => {
    const email = normalizedEmail(ownerEmail);
    const now = new Date().toISOString();
    const owned = data.groups.filter((group) => group.ownerEmail === email);
    for (const group of owned) {
      data.deletions = [...data.deletions.filter((item) => item.groupId !== group.groupId), { groupId: group.groupId, groupName: group.groupName, ownerEmail: email, deletedAt: now }];
    }
    const ids = new Set(owned.map((group) => group.groupId));
    data.invitations = data.invitations.map((item) => ids.has(item.group.id) ? { ...item, invitation: { ...item.invitation, isActive: false, revokedAt: now } } : item);
    return owned.length;
  });
}
