import { SUPPORTED_CURRENCIES, type CurrencyCode } from "./types";

export const CBSA_EXCHANGE_RATE_URL = "https://bcd-api-dca-ipa.cbsa-asfc.cloud-nuage.canada.ca/exchange-rate-lambda/exchange-rates";

interface CbsaCurrencyValue {
  Value?: unknown;
}

interface CbsaForeignExchangeRate {
  Rate?: unknown;
  ExchangeRateEffectiveTimestamp?: unknown;
  ExchangeRateExpiryTimestamp?: unknown;
  ExchangeRateSource?: unknown;
  FromCurrency?: CbsaCurrencyValue;
  ToCurrency?: CbsaCurrencyValue;
}

export interface ExchangeRateQuote {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  effectiveAt: string;
  expiresAt: string;
  provider: "CBSA";
  providerSource: string;
}

export function resolveRecordBaseCurrency({
  defaultCurrency,
  groupCurrency,
  eventCurrency,
  storedBaseCurrency,
}: {
  defaultCurrency: CurrencyCode;
  groupCurrency?: CurrencyCode;
  eventCurrency?: CurrencyCode;
  storedBaseCurrency?: CurrencyCode;
}): CurrencyCode {
  return storedBaseCurrency ?? eventCurrency ?? groupCurrency ?? defaultCurrency;
}

export function shouldFetchAutomaticExchangeRate({
  isNewRecord,
  currency,
  baseCurrency,
}: {
  isNewRecord: boolean;
  currency: CurrencyCode;
  baseCurrency: CurrencyCode;
}) {
  return isNewRecord && currency !== baseCurrency;
}

export function isSupportedCurrency(value: string | null): value is CurrencyCode {
  return value !== null && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function quoteFromCbsaPayload(payload: unknown, fromCurrency: CurrencyCode, toCurrency: CurrencyCode): ExchangeRateQuote {
  const records = isRecord(payload) && Array.isArray(payload.ForeignExchangeRates)
    ? payload.ForeignExchangeRates.filter(isRecord) as CbsaForeignExchangeRate[]
    : [];

  const from = findCadRate(records, fromCurrency);
  const to = findCadRate(records, toCurrency);
  const rate = from.rate / to.rate;

  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`CBSA returned an invalid ${fromCurrency} to ${toCurrency} rate.`);

  return {
    fromCurrency,
    toCurrency,
    rate,
    effectiveAt: from.effectiveAt || to.effectiveAt,
    expiresAt: from.expiresAt || to.expiresAt,
    provider: "CBSA",
    providerSource: fromCurrency === "CAD" ? to.source : from.source,
  };
}

function findCadRate(records: CbsaForeignExchangeRate[], currency: CurrencyCode) {
  const record = records.find((candidate) => (
    candidate.FromCurrency?.Value === currency
    && candidate.ToCurrency?.Value === "CAD"
  ));
  const rate = Number(record?.Rate);
  if (!record || !Number.isFinite(rate) || rate <= 0) throw new Error(`CBSA did not provide a valid ${currency} to CAD rate.`);

  return {
    rate,
    effectiveAt: typeof record.ExchangeRateEffectiveTimestamp === "string" ? record.ExchangeRateEffectiveTimestamp : "",
    expiresAt: typeof record.ExchangeRateExpiryTimestamp === "string" ? record.ExchangeRateExpiryTimestamp : "",
    source: typeof record.ExchangeRateSource === "string" ? record.ExchangeRateSource : "CBSA",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
