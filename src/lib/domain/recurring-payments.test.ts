import { describe, expect, it } from "vitest";
import { createRecurringRecord, duePaymentDates, nextPaymentDate, occurrenceDate, resumeRecurringPayment, validateRecurringPayment } from "./recurring-payments";
import { seedSnapshot } from "./seed";
import type { RecurringPayment } from "./types";

export const testPayment: RecurringPayment = {
  id: "recurring-internet", version: 1, name: "Internet fee", categoryId: "food", amount: 60,
  currency: "CAD", frequency: "month", interval: 1, startDate: "2026-01-31",
  nextOccurrence: 0, status: "active", createdBy: seedSnapshot.currentUser.id,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", syncStatus: "pending",
};

describe("personal recurring schedule", () => {
  it("clamps short months without drifting away from the 31st", () => {
    expect([0, 1, 2, 3].map((index) => occurrenceDate(testPayment, index))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("returns to Feb 29 in leap years", () => {
    const payment = { ...testPayment, frequency: "year" as const, startDate: "2024-02-29" };
    expect(occurrenceDate(payment, 1)).toBe("2025-02-28");
    expect(occurrenceDate(payment, 4)).toBe("2028-02-29");
  });
  it("supports custom weekly repeats across daylight-saving dates", () => {
    const payment = { ...testPayment, frequency: "week" as const, interval: 2, startDate: "2026-03-01" };
    expect(occurrenceDate(payment, 1)).toBe("2026-03-15");
    expect(occurrenceDate(payment, 2)).toBe("2026-03-29");
  });
  it("catches up only through today and includes the end date", () => {
    expect(duePaymentDates(testPayment, "2026-03-30")).toEqual(["2026-01-31", "2026-02-28"]);
    const payment = { ...testPayment, endDate: "2026-02-28" };
    expect(duePaymentDates(payment, "2026-08-01")).toEqual(["2026-01-31", "2026-02-28"]);
    expect(nextPaymentDate({ ...payment, nextOccurrence: 2 })).toBeUndefined();
  });
  it("respects the persisted cursor and bounds long catch-up batches", () => {
    expect(duePaymentDates({ ...testPayment, nextOccurrence: 2 }, "2026-03-31")).toEqual(["2026-03-31"]);
    expect(duePaymentDates({ ...testPayment, frequency: "day" }, "2026-12-31")).toHaveLength(90);
  });
  it("does not generate while paused or deleted, and skips paused dates on resume", () => {
    expect(duePaymentDates({ ...testPayment, status: "paused" }, "2026-08-31")).toEqual([]);
    expect(duePaymentDates({ ...testPayment, status: "deleted" }, "2026-08-31")).toEqual([]);
    const resumed = resumeRecurringPayment({ ...testPayment, status: "paused" }, "2026-03-31");
    expect(duePaymentDates(resumed, "2026-03-31")).toEqual(["2026-03-31"]);
  });
  it("rejects dates, amounts and intervals that could create invalid records", () => {
    expect(() => validateRecurringPayment({ ...testPayment, interval: 0 })).toThrow();
    expect(() => validateRecurringPayment({ ...testPayment, amount: NaN })).toThrow();
    expect(() => validateRecurringPayment({ ...testPayment, currency: "JPY", amount: 1.5 })).toThrow();
    expect(() => validateRecurringPayment({ ...testPayment, startDate: "2026-02-30" })).toThrow();
    expect(() => validateRecurringPayment({ ...testPayment, endDate: "2025-12-01" })).toThrow();
  });
});

describe("recurring expense generation", () => {
  const user = seedSnapshot.currentUser;
  const now = new Date("2026-08-31T19:00:00Z");
  it("creates only personal expenses with stable occurrence IDs", () => {
    const record = createRecurringRecord(testPayment, "2026-01-31", user, now);
    expect(record).toMatchObject({ recurringPaymentId: testPayment.id, recurringPaymentDate: "2026-01-31", recordType: "expense", amountBase: 60, payerId: user.id });
    expect(record.groupId).toBeUndefined();
    expect(record.eventId).toBeUndefined();
    expect(record.id).toMatch(/^[a-zA-Z0-9-]+$/);
    expect(record.splits).toHaveLength(1);
    expect(record.splits[0].memberId).toBe(user.id);
    expect(createRecurringRecord(testPayment, "2026-01-31", user, new Date()).id).toBe(record.id);
    expect(createRecurringRecord(testPayment, "2026-02-28", user, now).id).not.toBe(record.id);
  });
  it("saves an available conversion, or leaves missing conversion explicit offline", () => {
    const payment = { ...testPayment, currency: "JPY" as const, amount: 6000 };
    const record = createRecurringRecord(payment, "2026-01-31", user, now, { fromCurrency: "JPY", toCurrency: "CAD", rate: 0.009, effectiveAt: "2026-08-31", expiresAt: "2026-09-01", provider: "CBSA", providerSource: "test" });
    expect(record).toMatchObject({ amountOriginal: 6000, amountBase: 54, baseCurrency: "CAD", exchangeRate: 0.009, exchangeRateSource: "automatic" });
    const offline = createRecurringRecord(payment, "2026-01-31", user, now);
    expect(offline).toMatchObject({ amountOriginal: 6000, amountBase: 6000, baseCurrency: "JPY" });
    expect(offline.amountReporting).toBeUndefined();
  });
});
