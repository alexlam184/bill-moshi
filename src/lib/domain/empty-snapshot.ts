import { defaultCategories } from "./categories";
import type { AppSnapshot } from "./types";

export function emptySnapshot(currentUser: AppSnapshot["currentUser"] = {
  id: "local-user", name: "You", email: "", defaultCurrency: "CAD",
}): AppSnapshot {
  return {
    currentUser: { ...currentUser },
    groups: [], groupMembers: [], events: [], members: [],
    categories: structuredClone(defaultCategories), records: [], recurringPayments: [],
    debtRecords: [], settlements: [], invitations: [], joinRequests: [], activity: [], groupDeletionNotices: [],
  };
}
