import { describe, expect, it } from "vitest";
import { quoteFromCbsaPayload, resolveRecordBaseCurrency, shouldFetchAutomaticExchangeRate } from "./exchange-rates";

const payload = {
  ForeignExchangeRates: [
    rate("CAD", "1", "CBSA"),
    rate("HKD", "0.18", "BoC"),
    rate("JPY", "0.009", "BoC"),
  ],
};

describe("CBSA exchange rates", () => {
  it("returns the published currency-to-CAD rate", () => {
    expect(quoteFromCbsaPayload(payload, "HKD", "CAD")).toMatchObject({
      fromCurrency: "HKD",
      toCurrency: "CAD",
      rate: 0.18,
      provider: "CBSA",
      providerSource: "BoC",
    });
  });

  it("derives a cross rate through CAD", () => {
    expect(quoteFromCbsaPayload(payload, "HKD", "JPY").rate).toBeCloseTo(20);
    expect(quoteFromCbsaPayload(payload, "CAD", "HKD").rate).toBeCloseTo(1 / 0.18);
  });

  it("rejects missing or zero rates", () => {
    expect(() => quoteFromCbsaPayload({ ForeignExchangeRates: [rate("CAD", "1", "CBSA")] }, "JPY", "CAD")).toThrow("valid JPY to CAD rate");
    expect(() => quoteFromCbsaPayload({ ForeignExchangeRates: [rate("CAD", "1", "CBSA"), rate("JPY", "0", "BoC")] }, "JPY", "CAD")).toThrow("valid JPY to CAD rate");
  });
});

describe("record base currency precedence", () => {
  it("uses Event, then Group, then the user's default currency", () => {
    expect(resolveRecordBaseCurrency({ defaultCurrency: "CAD" })).toBe("CAD");
    expect(resolveRecordBaseCurrency({ defaultCurrency: "CAD", groupCurrency: "HKD" })).toBe("HKD");
    expect(resolveRecordBaseCurrency({ defaultCurrency: "CAD", groupCurrency: "HKD", eventCurrency: "JPY" })).toBe("JPY");
  });

  it("preserves a stored record base currency when settings later change", () => {
    expect(resolveRecordBaseCurrency({
      defaultCurrency: "JPY",
      groupCurrency: "JPY",
      eventCurrency: "JPY",
      storedBaseCurrency: "CAD",
    })).toBe("CAD");
  });
});

describe("automatic exchange-rate requests", () => {
  it("requests a rate only for a new record with a different currency", () => {
    expect(shouldFetchAutomaticExchangeRate({ isNewRecord: true, currency: "JPY", baseCurrency: "CAD" })).toBe(true);
    expect(shouldFetchAutomaticExchangeRate({ isNewRecord: true, currency: "CAD", baseCurrency: "CAD" })).toBe(false);
    expect(shouldFetchAutomaticExchangeRate({ isNewRecord: false, currency: "JPY", baseCurrency: "CAD" })).toBe(false);
    expect(shouldFetchAutomaticExchangeRate({ isNewRecord: false, currency: "CAD", baseCurrency: "CAD" })).toBe(false);
  });
});

function rate(currency: string, value: string, source: string) {
  return {
    Rate: value,
    ExchangeRateEffectiveTimestamp: "2026-08-12T00:00:00.000Z",
    ExchangeRateExpiryTimestamp: "2026-08-12T23:59:59.000Z",
    ExchangeRateSource: source,
    FromCurrency: { Value: currency },
    ToCurrency: { Value: "CAD" },
  };
}
