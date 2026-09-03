import { describe, expect, it } from "vitest";
import { allocateSplits, eventNetBalances, recordMatchesInsightScope, recordMatchesRecordContext, recordRelatedToUser, groupCurrencyBalancesForUser, groupDailyNetBalances, groupNetBalancesByUser, groupSpendingByDay, memberIdsForUser, overallReportingBalanceForUser, recordsMissingReportingRate, roundMoney, settlementRelatedToUser, simplifyBalances } from "./calculations";
import { buildMonthGrid, calendarDayTotals, calendarMonthTotals, recordsForCalendarScope } from "./calendar";
import { insightDateRange, recordInInsightDateRange, recordsForInsightScope, summarizeInsightRecords } from "./insights";
import { dateInRange } from "./date-filter";
import { calculateDebtShareAmounts, equalDebtShareValues, parseDebtPersonNames, summarizeUnpaidDebtRecords } from "./debt-records";
import { seedSnapshot } from "./seed";
import { deleteGroupData, leaveGroupData } from "./group-lifecycle";
import type { Settlement } from "./types";

describe("allocateSplits", () => {
  it("keeps an equal CAD split equal to the original total", () => {
    const splits = allocateSplits("expense", 10, "CAD", "equal", ["a", "b", "c"].map((memberId) => ({ memberId })));
    expect(splits.map((split) => split.owedAmount)).toEqual([3.34, 3.33, 3.33]);
    expect(splits.reduce((sum, split) => sum + split.owedAmount, 0)).toBe(10);
  });

  it("uses zero-decimal rounding for JPY without losing a yen", () => {
    const splits = allocateSplits("expense", 100, "JPY", "equal", ["a", "b", "c"].map((memberId) => ({ memberId })));
    expect(splits.map((split) => split.owedAmount)).toEqual([34, 33, 33]);
  });

  it("rejects invalid exact and percentage allocations", () => {
    expect(() => allocateSplits("expense", 10, "CAD", "exact", [{ memberId: "a", value: 4 }, { memberId: "b", value: 5 }])).toThrow(/add up/);
    expect(() => allocateSplits("expense", 10, "CAD", "percentage", [{ memberId: "a", value: 40 }, { memberId: "b", value: 40 }])).toThrow(/100%/);
  });

  it("allocates proportional shares", () => {
    const splits = allocateSplits("expense", 80, "CAD", "shares", [{ memberId: "a", value: 1 }, { memberId: "b", value: 2 }, { memberId: "c", value: 1 }]);
    expect(splits.map((split) => split.owedAmount)).toEqual([20, 40, 20]);
  });
});

describe("monthly calendar", () => {
  it("builds a consistent six-week Sunday-first month grid", () => {
    const august = buildMonthGrid(2026, 7);

    expect(august).toHaveLength(42);
    expect(august[0]).toEqual({ date: "2026-07-26", dayNumber: 26, inCurrentMonth: false });
    expect(august[6]).toEqual({ date: "2026-08-01", dayNumber: 1, inCurrentMonth: true });
    expect(august.at(-1)).toEqual({ date: "2026-09-05", dayNumber: 5, inCurrentMonth: false });
  });

  it("keeps All Groups personal records while a Group calendar stays scoped", () => {
    const allRecords = recordsForCalendarScope(seedSnapshot.records);
    const familyRecords = recordsForCalendarScope(seedSnapshot.records, "group-family");

    expect(allRecords.some((record) => !record.groupId)).toBe(true);
    expect(familyRecords.every((record) => record.groupId === "group-family")).toBe(true);
    expect(familyRecords.some((record) => !record.groupId)).toBe(false);
  });

  it("summarizes expenses, income, and transfers without mixing currencies", () => {
    const template = seedSnapshot.records.find((record) => record.id === "expense-groceries")!;
    const records = [
      { ...template, id: "calendar-expense", transactionDate: "2026-08-10T10:00:00.000Z", amountOriginal: 80, recordType: "expense" as const },
      { ...template, id: "calendar-income", transactionDate: "2026-08-10T12:00:00.000Z", amountOriginal: 30, recordType: "income" as const },
      { ...template, id: "calendar-transfer", transactionDate: "2026-08-11T12:00:00.000Z", amountOriginal: 15, recordType: "transfer" as const },
      { ...template, id: "calendar-hkd", transactionDate: "2026-08-10T14:00:00.000Z", amountOriginal: 500, currencyOriginal: "HKD" as const, recordType: "expense" as const },
    ];

    expect(calendarDayTotals(records, "CAD").get("2026-08-10")).toEqual({ expense: 80, income: 30, transfer: 0 });
    expect(calendarMonthTotals(records, 2026, 7, "CAD")).toEqual({ expense: 80, income: 30, transfer: 15 });
    expect(calendarMonthTotals(records, 2026, 7, "HKD")).toEqual({ expense: 500, income: 0, transfer: 0 });
  });
});

describe("Insight reporting", () => {
  it("switches cleanly between Group and Myself ledgers", () => {
    const family = recordsForInsightScope(seedSnapshot.records, "group", "group-family");
    const toronto = recordsForInsightScope(seedSnapshot.records, "group", "group-family", "event-toronto");
    const myself = recordsForInsightScope(seedSnapshot.records, "myself");

    expect(family.every((record) => record.groupId === "group-family")).toBe(true);
    expect(toronto.every((record) => record.eventId === "event-toronto")).toBe(true);
    expect(myself.length).toBeGreaterThan(0);
    expect(myself.every((record) => !record.groupId && !record.eventId)).toBe(true);
  });

  it("creates inclusive preset and custom date ranges", () => {
    const today = new Date(2026, 7, 11, 12);

    expect(insightDateRange("today", today)).toEqual({ start: "2026-08-11", end: "2026-08-11" });
    expect(insightDateRange("last7", today)).toEqual({ start: "2026-08-05", end: "2026-08-11" });
    expect(insightDateRange("last30", today)).toEqual({ start: "2026-07-13", end: "2026-08-11" });
    expect(insightDateRange("month", today)).toEqual({ start: "2026-08-01", end: "2026-08-11" });
    expect(insightDateRange("year", today)).toEqual({ start: "2026-01-01", end: "2026-08-11" });
    expect(insightDateRange("custom", today, { start: "2026-08-09", end: "2026-08-10" })).toEqual({ start: "2026-08-09", end: "2026-08-10" });

    const range = { start: "2026-08-09", end: "2026-08-10" };
    expect(seedSnapshot.records.filter((record) => recordInInsightDateRange(record, range)).map((record) => record.id)).toEqual(expect.arrayContaining(["expense-groceries", "expense-personal-coffee"]));
  });

  it("shows Income, LedgerRecord, Balance, and all Record types without mixing currencies", () => {
    const template = seedSnapshot.records.find((record) => record.id === "expense-groceries")!;
    const records = [
      { ...template, id: "insight-expense", recordType: "expense" as const, amountBase: 80 },
      { ...template, id: "insight-income", recordType: "income" as const, amountBase: 30 },
      { ...template, id: "insight-transfer", recordType: "transfer" as const, amountBase: 15 },
      { ...template, id: "insight-hkd", recordType: "expense" as const, amountBase: 500, baseCurrency: "HKD" as const },
    ];

    expect(summarizeInsightRecords(records, "CAD")).toEqual({ expense: 80, income: 30, balance: -50, records: 3 });
    expect(summarizeInsightRecords(records, "HKD")).toEqual({ expense: 500, income: 0, balance: -500, records: 1 });
  });
});

describe("Records date filter", () => {
  it("includes both boundaries for expense and settlement timestamps", () => {
    const range = { start: "2026-08-09", end: "2026-08-10" };

    expect(dateInRange("2026-08-09T00:00:00.000Z", range)).toBe(true);
    expect(dateInRange("2026-08-10T23:59:59.999Z", range)).toBe(true);
    expect(dateInRange("2026-08-08T23:59:59.999Z", range)).toBe(false);
    expect(dateInRange("2026-08-11T00:00:00.000Z", range)).toBe(false);
  });
});

describe("standalone debt records", () => {
  it("parses bulk English and Chinese names separated by lines or commas", () => {
    expect(parseDebtPersonNames("Mary\nPeter\r\nTom,Paul\uff0c\u9673\u5927\u6587\u3001\u738b\u5c0f\u660e")).toEqual([
      "Mary",
      "Peter",
      "Tom",
      "Paul",
      "\u9673\u5927\u6587",
      "\u738b\u5c0f\u660e",
    ]);
  });

  it("ignores blank and duplicate bulk debt names while preserving display text", () => {
    expect(parseDebtPersonNames(" Mary, mary, , MARY\n\u674e\u96f7\n\u674e\u96f7 ")).toEqual(["Mary", "\u674e\u96f7"]);
  });

  it("creates equal exact shares without losing currency rounding", () => {
    expect(calculateDebtShareAmounts(100, "CAD", "equal", [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(equalDebtShareValues(100, 3, "CAD", "exact")).toEqual([33.34, 33.33, 33.33]);
    expect(calculateDebtShareAmounts(100, "CAD", "exact", [20, 30, 50])).toEqual([20, 30, 50]);
    expect(() => calculateDebtShareAmounts(100, "CAD", "exact", [20, 30, 40])).toThrow(/must total/);
  });

  it("converts edited percentages to record amounts and absorbs rounding", () => {
    expect(equalDebtShareValues(100, 3, "CAD", "percentage")).toEqual([33.34, 33.33, 33.33]);
    expect(calculateDebtShareAmounts(10, "CAD", "percentage", [33.34, 33.33, 33.33])).toEqual([3.33, 3.33, 3.34]);
    expect(() => calculateDebtShareAmounts(100, "CAD", "percentage", [20, 30, 40])).toThrow(/100%/);
  });

  it("allocates relative shares and preserves the total", () => {
    expect(equalDebtShareValues(100, 3, "CAD", "shares")).toEqual([1, 1, 1]);
    expect(calculateDebtShareAmounts(100, "CAD", "shares", [1, 2, 1])).toEqual([25, 50, 25]);
    expect(calculateDebtShareAmounts(100, "JPY", "shares", [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("keeps money owed in each direction and currency separate and excludes paid records", () => {
    const template = {
      id: "debt-1",
      personName: "Alex",
      name: "Dinner",
      date: "2026-08-11",
      status: "unpaid" as const,
      createdBy: "user-tom",
      createdAt: "2026-08-11T12:00:00.000Z",
      updatedAt: "2026-08-11T12:00:00.000Z",
      syncStatus: "synced" as const,
    };
    const summaries = summarizeUnpaidDebtRecords([
      { ...template, direction: "borrowed", amount: 40, currency: "CAD" },
      { ...template, id: "debt-2", direction: "lent", amount: 25, currency: "CAD" },
      { ...template, id: "debt-3", direction: "lent", amount: 5000, currency: "JPY" },
      { ...template, id: "debt-4", direction: "borrowed", amount: 99, currency: "CAD", status: "paid" },
    ]);

    expect(summaries).toEqual([
      { currency: "CAD", borrowed: 40, lent: 25 },
      { currency: "JPY", borrowed: 0, lent: 5000 },
    ]);
  });
});

describe("balances", () => {
  it("always produces a zero-sum event balance", () => {
    const balances = eventNetBalances("event-toronto", seedSnapshot.members, seedSnapshot.records, []);
    expect(roundMoney([...balances.values()].reduce((sum, balance) => sum + balance, 0), "CAD")).toBeCloseTo(0);
  });

  it("keeps optional-event daily expenses in a zero-sum group balance", () => {
    const balances = groupDailyNetBalances("group-family", "CAD", seedSnapshot.groupMembers, seedSnapshot.records);
    expect(roundMoney([...balances.values()].reduce((sum, balance) => sum + balance, 0), "CAD")).toBeCloseTo(0);
    expect(balances.get("group-member-tom-family")).toBeGreaterThan(0);
  });

  it("a partial settlement reduces both sides while preserving zero-sum", () => {
    const before = eventNetBalances("event-toronto", seedSnapshot.members, seedSnapshot.records, []);
    const debt = simplifyBalances(before, "CAD")[0];
    expect(debt).toBeDefined();
    const settlement: Settlement = {
      id: "settlement-test",
      fromMemberId: debt.fromMemberId,
      toMemberId: debt.toMemberId,
      amount: 10,
      currency: "CAD",
      date: new Date().toISOString(),
      scope: "current",
      paymentMethod: "Cash",
      createdBy: "user-tom",
      createdAt: new Date().toISOString(),
      events: [{ eventId: "event-toronto", allocatedAmount: 10 }],
      syncStatus: "pending",
    };
    const after = eventNetBalances("event-toronto", seedSnapshot.members, seedSnapshot.records, [settlement]);
    expect(roundMoney((after.get(debt.fromMemberId) ?? 0) - (before.get(debt.fromMemberId) ?? 0), "CAD")).toBe(10);
    expect(roundMoney((after.get(debt.toMemberId) ?? 0) - (before.get(debt.toMemberId) ?? 0), "CAD")).toBe(-10);
    expect(roundMoney([...after.values()].reduce((sum, balance) => sum + balance, 0), "CAD")).toBe(0);
  });

  it("aggregates a group across daily and event expenses without mixing currencies", () => {
    const balances = groupNetBalancesByUser("group-family", "CAD", seedSnapshot.events, seedSnapshot.members, seedSnapshot.groupMembers, seedSnapshot.records, seedSnapshot.settlements);
    const total = [...balances.values()].reduce((sum, balance) => sum + balance, 0);
    expect(roundMoney(total, "CAD")).toBe(0);
    expect(balances.size).toBe(3);
  });

  it("summarizes what the current user owes or is owed in each Group currency", () => {
    const tom = groupCurrencyBalancesForUser("group-family", "user-tom", seedSnapshot.events, seedSnapshot.members, seedSnapshot.groupMembers, seedSnapshot.records, seedSnapshot.settlements);
    const alex = groupCurrencyBalancesForUser("group-family", "user-alex", seedSnapshot.events, seedSnapshot.members, seedSnapshot.groupMembers, seedSnapshot.records, seedSnapshot.settlements);

    expect(tom).toEqual([{ currency: "CAD", balance: 362.04 }]);
    expect(alex).toEqual([{ currency: "CAD", balance: -151.48 }]);
  });

  it("builds a seven-day group and current-user spending series", () => {
    const days = groupSpendingByDay("group-family", "CAD", seedSnapshot.currentUser.id, seedSnapshot.members, seedSnapshot.groupMembers, seedSnapshot.records);
    expect(days).toHaveLength(7);
    expect(days.at(-1)?.date).toBe("2026-09-22");
    expect(days.reduce((sum, day) => sum + day.groupAmount, 0)).toBeGreaterThan(0);
    expect(days.reduce((sum, day) => sum + day.myAmount, 0)).toBeGreaterThan(0);
  });

  it("reverses shared income and applies a transfer between two members", () => {
    const income = {
      ...seedSnapshot.records.find((record) => record.id === "expense-groceries")!,
      id: "income-refund",
      recordType: "income" as const,
      amountOriginal: 90,
      amountBase: 90,
      splits: allocateSplits("income-refund", 90, "CAD", "equal", [
        "group-member-tom-family",
        "group-member-alex-family",
        "group-member-blair-family",
      ].map((memberId) => ({ memberId }))),
    };
    const transfer = {
      ...income,
      id: "transfer-alex-tom",
      recordType: "transfer" as const,
      payerId: "group-member-alex-family",
      amountOriginal: 10,
      amountBase: 10,
      splits: allocateSplits("transfer-alex-tom", 10, "CAD", "exact", [{ memberId: "group-member-tom-family", value: 10 }]),
    };
    const balances = groupDailyNetBalances("group-family", "CAD", seedSnapshot.groupMembers, [income, transfer]);
    expect(balances.get("group-member-tom-family")).toBe(-70);
    expect(balances.get("group-member-alex-family")).toBe(40);
    expect(balances.get("group-member-blair-family")).toBe(30);
    expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("excludes income and transfers from seven-day spending", () => {
    const base = groupSpendingByDay("group-family", "CAD", seedSnapshot.currentUser.id, seedSnapshot.members, seedSnapshot.groupMembers, seedSnapshot.records);
    const original = seedSnapshot.records.find((record) => record.id === "expense-uber")!;
    const otherRecords = [
      { ...original, id: "income-test", recordType: "income" as const, amountBase: 999, amountOriginal: 999 },
      { ...original, id: "transfer-test", recordType: "transfer" as const, amountBase: 999, amountOriginal: 999 },
    ];
    const withOtherRecords = groupSpendingByDay("group-family", "CAD", seedSnapshot.currentUser.id, seedSnapshot.members, seedSnapshot.groupMembers, [...seedSnapshot.records, ...otherRecords]);
    expect(withOtherRecords).toEqual(base);
  });

  it("settles a debt relation with an equal Transfer record", () => {
    const template = seedSnapshot.records.find((record) => record.id === "expense-groceries")!;
    const record = {
      ...template,
      id: "expense-debt-source",
      amountOriginal: 30,
      amountBase: 30,
      splits: allocateSplits("expense-debt-source", 30, "CAD", "exact", [{ memberId: "group-member-alex-family", value: 30 }]),
    };
    const before = groupDailyNetBalances("group-family", "CAD", seedSnapshot.groupMembers, [record]);
    const debt = simplifyBalances(before, "CAD")[0];
    const transfer = {
      ...template,
      id: "transfer-debt-settlement",
      recordType: "transfer" as const,
      payerId: debt.fromMemberId,
      amountOriginal: debt.amount,
      amountBase: debt.amount,
      splits: allocateSplits("transfer-debt-settlement", debt.amount, "CAD", "exact", [{ memberId: debt.toMemberId, value: debt.amount }]),
    };
    const after = groupDailyNetBalances("group-family", "CAD", seedSnapshot.groupMembers, [record, transfer]);

    expect(debt).toEqual({ fromMemberId: "group-member-alex-family", toMemberId: "group-member-tom-family", amount: 30 });
    expect([...after.values()]).toEqual([0, 0, 0]);
    expect(simplifyBalances(after, "CAD")).toEqual([]);
  });
});

describe("All Groups reporting currency", () => {
  const source = seedSnapshot.records.find((record) => record.id === "expense-groceries")!;
  const converted = {
    ...source,
    id: "expense-jpy-reporting",
    amountOriginal: 1_000,
    currencyOriginal: "JPY" as const,
    amountBase: 1_000,
    baseCurrency: "JPY" as const,
    reportingCurrency: "CAD" as const,
    baseToReportingRate: 0.01,
    amountReporting: 10,
    reportingRateSource: "manual" as const,
    splits: allocateSplits("expense-jpy-reporting", 1_000, "JPY", "equal", [
      { memberId: "group-member-tom-family" },
      { memberId: "group-member-alex-family" },
    ]),
  };

  it("uses the saved base-to-reporting rate for the signed-in user's balance", () => {
    const summary = overallReportingBalanceForUser(
      "user-tom",
      "CAD",
      seedSnapshot.members,
      seedSnapshot.groupMembers,
      [converted],
      [],
    );
    expect(summary.balance).toBe(5);
    expect(summary.missingRecordIds).toEqual([]);
  });

  it("lists older records that do not have a compatible reporting rate", () => {
    const legacy = { ...converted, reportingCurrency: undefined, baseToReportingRate: undefined, amountReporting: undefined };
    expect(recordsMissingReportingRate([legacy], "CAD").map((record) => record.id)).toEqual([legacy.id]);
    expect(recordsMissingReportingRate([legacy], "JPY")).toEqual([]);
  });
});

describe("group and event hierarchy", () => {
  it("keeps every event inside an existing group", () => {
    expect(seedSnapshot.groups.map((group) => group.name)).toEqual(expect.arrayContaining(["Moshi Family", "Roommates"]));
    expect(seedSnapshot.events.every((event) => seedSnapshot.groups.some((group) => group.id === event.groupId))).toBe(true);
    expect(seedSnapshot.records.filter((record) => record.groupId).every((record) => seedSnapshot.groups.some((group) => group.id === record.groupId))).toBe(true);
    expect(seedSnapshot.records.filter((record) => record.eventId).every((record) => seedSnapshot.events.some((event) => event.id === record.eventId && event.groupId === record.groupId))).toBe(true);
    expect(seedSnapshot.records.some((record) => !record.eventId)).toBe(true);
    expect(seedSnapshot.records.some((record) => !record.groupId && !record.eventId && record.payerId === seedSnapshot.currentUser.id)).toBe(true);
    expect(seedSnapshot.events.every((event) => {
      const approvedUsers = new Set(seedSnapshot.groupMembers.filter((member) => member.groupId === event.groupId).map((member) => member.userId));
      const eventUsers = new Set(seedSnapshot.members.filter((member) => member.eventId === event.id && member.status === "active").map((member) => member.userId));
      return [...approvedUsers].every((userId) => eventUsers.has(userId));
    })).toBe(true);
    expect(seedSnapshot.invitations.every((invitation) => seedSnapshot.groups.some((group) => group.id === invitation.groupId))).toBe(true);
  });
});

describe("Insight scope", () => {
  it("shows all Group expenses or narrows every result to one Event", () => {
    const familyRecords = seedSnapshot.records.filter((record) => recordMatchesInsightScope(record, "group-family"));
    const torontoRecords = seedSnapshot.records.filter((record) => recordMatchesInsightScope(record, "group-family", "event-toronto"));

    expect(familyRecords.length).toBeGreaterThan(torontoRecords.length);
    expect(familyRecords.every((record) => record.groupId === "group-family" && record.recordType === "expense")).toBe(true);
    expect(torontoRecords.length).toBeGreaterThan(0);
    expect(torontoRecords.every((record) => record.eventId === "event-toronto")).toBe(true);
  });
});

describe("group lifecycle", () => {
  it("prevents a non-owner from deleting a group", () => {
    expect(() => deleteGroupData(seedSnapshot, "group-family", "user-alex")).toThrow(/Only the group owner/);
  });

  it("cascades owner deletion without removing personal or other-group records", () => {
    const deleted = deleteGroupData(seedSnapshot, "group-family", "user-tom");
    expect(deleted.groups.some((group) => group.id === "group-family")).toBe(false);
    expect(deleted.events.some((event) => event.groupId === "group-family")).toBe(false);
    expect(deleted.records.some((record) => record.groupId === "group-family")).toBe(false);
    expect(deleted.records.some((record) => !record.groupId)).toBe(true);
    expect(deleted.groups.some((group) => group.id === "group-roommates")).toBe(true);
  });

  it("lets an active member leave but never lets the owner orphan the group", () => {
    const memberView = {
      ...seedSnapshot,
      currentUser: { id: "user-alex", name: "Alex", email: "alex@example.com", defaultCurrency: "CAD" as const },
    };
    const result = leaveGroupData(memberView, "group-family", "user-alex");
    expect(result.groupMember.status).toBe("left");
    expect(result.eventMembers.every((member) => member.status === "left")).toBe(true);
    expect(result.snapshot.groups.some((group) => group.id === "group-family")).toBe(false);
    expect(() => leaveGroupData(seedSnapshot, "group-family", "user-tom")).toThrow(/owner cannot leave/);
  });
});

describe("Myself records", () => {
  const myMemberIds = memberIdsForUser(
    seedSnapshot.currentUser.id,
    seedSnapshot.members,
    seedSnapshot.groupMembers,
  );

  it("recognizes current-user membership across events and daily group expenses", () => {
    expect(myMemberIds.has("member-tom")).toBe(true);
    expect(myMemberIds.has("group-member-tom-family")).toBe(true);
  });

  it("includes paid, split, created, and settlement records involving the current user", () => {
    const record = seedSnapshot.records[0];
    expect(recordRelatedToUser(record, seedSnapshot.currentUser.id, myMemberIds)).toBe(true);

    const unrelatedRecord = {
      ...record,
      createdBy: "user-someone-else",
      payerId: "member-someone-else",
      splits: record.splits.map((split) => ({ ...split, memberId: `other-${split.memberId}` })),
    };
    expect(recordRelatedToUser(unrelatedRecord, seedSnapshot.currentUser.id, myMemberIds)).toBe(false);

    const settlement: Settlement = {
      id: "settlement-mine",
      fromMemberId: "member-alex",
      toMemberId: "member-tom",
      amount: 12,
      currency: "CAD",
      date: "2026-08-10T17:00:00.000Z",
      scope: "current",
      paymentMethod: "Cash",
      createdBy: "user-alex",
      createdAt: "2026-08-10T17:00:00.000Z",
      events: [{ eventId: "event-toronto", allocatedAmount: 12 }],
      syncStatus: "synced",
    };
    expect(settlementRelatedToUser(settlement, seedSnapshot.currentUser.id, myMemberIds)).toBe(true);
    expect(settlementRelatedToUser({ ...settlement, createdBy: "other", fromMemberId: "other-a", toMemberId: "other-b" }, seedSnapshot.currentUser.id, myMemberIds)).toBe(false);
  });

  it("keeps the personal-only scope distinct from grouped records", () => {
    const personal = seedSnapshot.records.filter((record) => !record.groupId);
    const groupedRelated = seedSnapshot.records.filter((record) => record.groupId && recordRelatedToUser(record, seedSnapshot.currentUser.id, myMemberIds));

    expect(personal).toHaveLength(1);
    expect(personal[0].payerId).toBe(seedSnapshot.currentUser.id);
    expect(personal[0].eventId).toBeUndefined();
    expect(personal[0].splits.map((split) => split.memberId)).toEqual([seedSnapshot.currentUser.id]);
    expect(groupedRelated.length).toBeGreaterThan(0);
    expect(groupedRelated.every((record) => Boolean(record.groupId))).toBe(true);
  });

  it("includes personal and group expenses in the combined all-contexts filter", () => {
    const combined = seedSnapshot.records.filter((record) => recordMatchesRecordContext(record, "all"));
    const personal = combined.filter((record) => !record.groupId);
    const grouped = combined.filter((record) => record.groupId);

    expect(combined).toHaveLength(seedSnapshot.records.length);
    expect(personal.length).toBeGreaterThan(0);
    expect(grouped.length).toBeGreaterThan(0);
    expect(seedSnapshot.records.filter((record) => recordMatchesRecordContext(record, "personal"))).toEqual(personal);
  });

  it("keeps a current-group record filter inside that group", () => {
    const familyRecords = seedSnapshot.records.filter((record) => recordMatchesRecordContext(record, "group-family"));

    expect(familyRecords.length).toBeGreaterThan(0);
    expect(familyRecords.every((record) => record.groupId === "group-family")).toBe(true);
    expect(familyRecords.some((record) => !record.groupId)).toBe(false);
  });
});
