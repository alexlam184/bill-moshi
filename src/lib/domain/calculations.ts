import type {
  BillEvent,
  CurrencyCode,
  EventMember,
  LedgerRecord,
  RecordSplit,
  GroupMember,
  Settlement,
  SplitMethod,
} from "./types";

export function currencyDecimals(currency: CurrencyCode) {
  return currency === "JPY" ? 0 : 2;
}

export function roundMoney(value: number, currency: CurrencyCode) {
  const factor = 10 ** currencyDecimals(currency);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatMoney(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: currencyDecimals(currency),
    maximumFractionDigits: currencyDecimals(currency),
  }).format(value);
}

export function memberIdsForUser(
  userId: string,
  eventMembers: EventMember[],
  groupMembers: GroupMember[],
) {
  return new Set([
    ...eventMembers.filter((member) => member.userId === userId).map((member) => member.id),
    ...groupMembers.filter((member) => member.userId === userId).map((member) => member.id),
  ]);
}

export function recordRelatedToUser(
  record: LedgerRecord,
  userId: string,
  memberIds: ReadonlySet<string>,
) {
  return record.createdBy === userId
    || memberIds.has(record.payerId)
    || record.splits.some((split) => memberIds.has(split.memberId));
}

export function settlementRelatedToUser(
  settlement: Settlement,
  userId: string,
  memberIds: ReadonlySet<string>,
) {
  return settlement.createdBy === userId
    || memberIds.has(settlement.fromMemberId)
    || memberIds.has(settlement.toMemberId);
}

export function recordMatchesRecordContext(record: LedgerRecord, contextId: string) {
  if (contextId === "all") return true;
  if (contextId === "personal") return !record.groupId;
  return record.groupId === contextId;
}

export function recordMatchesInsightScope(
  record: LedgerRecord,
  contextId: string,
  eventId = "all",
) {
  return record.recordType === "expense"
    && recordMatchesRecordContext(record, contextId)
    && (eventId === "all" || record.eventId === eventId);
}

export function userIdForMember(
  memberId: string,
  eventMembers: EventMember[],
  groupMembers: GroupMember[],
) {
  return eventMembers.find((member) => member.id === memberId)?.userId
    ?? groupMembers.find((member) => member.id === memberId)?.userId;
}

function applyRecordBalance(
  balances: Map<string, number>,
  record: LedgerRecord,
  payerId: string | undefined,
  splitId: (memberId: string) => string | undefined = (memberId) => memberId,
) {
  const direction = record.recordType === "income" ? -1 : 1;
  if (payerId) balances.set(payerId, (balances.get(payerId) ?? 0) + record.amountBase * direction);
  for (const split of record.splits) {
    const memberId = splitId(split.memberId);
    if (memberId) balances.set(memberId, (balances.get(memberId) ?? 0) - split.owedAmount * direction);
  }
}

export function groupNetBalancesByUser(
  groupId: string,
  currency: CurrencyCode,
  events: BillEvent[],
  eventMembers: EventMember[],
  groupMembers: GroupMember[],
  records: LedgerRecord[],
  settlements: Settlement[],
) {
  const balances = new Map(
    groupMembers
      .filter((member) => member.groupId === groupId && member.status === "active")
      .map((member) => [member.userId, 0]),
  );

  for (const record of records.filter((item) => item.groupId === groupId && item.baseCurrency === currency)) {
    const payerUserId = userIdForMember(record.payerId, eventMembers, groupMembers);
    applyRecordBalance(balances, record, payerUserId, (memberId) => userIdForMember(memberId, eventMembers, groupMembers));
  }

  for (const settlement of settlements.filter((item) => item.currency === currency)) {
    const fromUserId = userIdForMember(settlement.fromMemberId, eventMembers, groupMembers);
    const toUserId = userIdForMember(settlement.toMemberId, eventMembers, groupMembers);
    if (!fromUserId || !toUserId) continue;
    for (const allocation of settlement.events) {
      const event = events.find((item) => item.id === allocation.eventId);
      if (!event || event.groupId !== groupId || event.baseCurrency !== currency) continue;
      balances.set(fromUserId, (balances.get(fromUserId) ?? 0) + allocation.allocatedAmount);
      balances.set(toUserId, (balances.get(toUserId) ?? 0) - allocation.allocatedAmount);
    }
  }

  return balances;
}

export function groupCurrencyBalancesForUser(
  groupId: string,
  userId: string,
  events: BillEvent[],
  eventMembers: EventMember[],
  groupMembers: GroupMember[],
  records: LedgerRecord[],
  settlements: Settlement[],
) {
  const groupEvents = events.filter((event) => event.groupId === groupId);
  const groupEventIds = new Set(groupEvents.map((event) => event.id));
  const currencies = new Set<CurrencyCode>([
    ...groupEvents.map((event) => event.baseCurrency),
    ...records.filter((record) => record.groupId === groupId).map((record) => record.baseCurrency),
    ...settlements
      .filter((settlement) => settlement.events.some((allocation) => groupEventIds.has(allocation.eventId)))
      .map((settlement) => settlement.currency),
  ]);

  return [...currencies]
    .map((currency) => ({
      currency,
      balance: roundMoney(groupNetBalancesByUser(
        groupId,
        currency,
        events,
        eventMembers,
        groupMembers,
        records,
        settlements,
      ).get(userId) ?? 0, currency),
    }))
    .filter(({ balance }) => balance !== 0);
}

export function recordReportingRate(record: LedgerRecord, reportingCurrency: CurrencyCode) {
  if (record.baseCurrency === reportingCurrency) return 1;
  if (
    record.reportingCurrency === reportingCurrency
    && typeof record.baseToReportingRate === "number"
    && Number.isFinite(record.baseToReportingRate)
    && record.baseToReportingRate > 0
  ) return record.baseToReportingRate;
  return undefined;
}

export function recordsMissingReportingRate(records: LedgerRecord[], reportingCurrency: CurrencyCode) {
  return records.filter((record) => recordReportingRate(record, reportingCurrency) === undefined);
}

export function overallReportingBalanceForUser(
  userId: string,
  reportingCurrency: CurrencyCode,
  eventMembers: EventMember[],
  groupMembers: GroupMember[],
  records: LedgerRecord[],
  settlements: Settlement[],
) {
  const missingRecordIds: string[] = [];
  let balance = 0;

  for (const record of records) {
    const reportingRate = recordReportingRate(record, reportingCurrency);
    if (reportingRate === undefined) {
      missingRecordIds.push(record.id);
      continue;
    }
    const direction = record.recordType === "income" ? -1 : 1;
    const payerUserId = userIdForMember(record.payerId, eventMembers, groupMembers)
      ?? (record.payerId === userId ? userId : undefined);
    let recordBalance = payerUserId === userId ? record.amountBase * direction : 0;
    for (const split of record.splits) {
      const splitUserId = userIdForMember(split.memberId, eventMembers, groupMembers)
        ?? (split.memberId === userId ? userId : undefined);
      if (splitUserId === userId) recordBalance -= split.owedAmount * direction;
    }
    balance += recordBalance * reportingRate;
  }

  let missingSettlementCount = 0;
  for (const settlement of settlements) {
    const fromUserId = userIdForMember(settlement.fromMemberId, eventMembers, groupMembers);
    const toUserId = userIdForMember(settlement.toMemberId, eventMembers, groupMembers);
    if (fromUserId !== userId && toUserId !== userId) continue;
    if (settlement.currency !== reportingCurrency) {
      missingSettlementCount += 1;
      continue;
    }
    if (fromUserId === userId) balance += settlement.amount;
    if (toUserId === userId) balance -= settlement.amount;
  }

  return {
    balance: roundMoney(balance, reportingCurrency),
    missingRecordIds,
    missingSettlementCount,
  };
}

export interface GroupSpendingDay {
  date: string;
  groupAmount: number;
  myAmount: number;
}

export function groupSpendingByDay(
  groupId: string,
  currency: CurrencyCode,
  userId: string,
  eventMembers: EventMember[],
  groupMembers: GroupMember[],
  records: LedgerRecord[],
  dayCount = 7,
): GroupSpendingDay[] {
  const matchingRecords = records.filter((record) => record.recordType === "expense" && record.groupId === groupId && record.baseCurrency === currency);
  const latestDate = matchingRecords.map((record) => record.transactionDate.slice(0, 10)).sort().at(-1)
    ?? new Date().toISOString().slice(0, 10);
  const endDate = new Date(`${latestDate}T12:00:00.000Z`);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(endDate.getUTCDate() - (dayCount - index - 1));
    const dateKey = date.toISOString().slice(0, 10);
    const daily = matchingRecords.filter((record) => record.transactionDate.slice(0, 10) === dateKey);
    return {
      date: dateKey,
      groupAmount: roundMoney(daily.reduce((sum, record) => sum + record.amountBase, 0), currency),
      myAmount: roundMoney(daily
        .filter((record) => userIdForMember(record.payerId, eventMembers, groupMembers) === userId)
        .reduce((sum, record) => sum + record.amountBase, 0), currency),
    };
  });
}

export interface SplitInput {
  memberId: string;
  value?: number;
}

export function allocateSplits(
  recordId: string,
  total: number,
  currency: CurrencyCode,
  method: SplitMethod,
  inputs: SplitInput[],
): RecordSplit[] {
  if (total <= 0 || inputs.length === 0) {
    throw new Error("Select at least one member and enter an amount above zero.");
  }

  const decimals = currencyDecimals(currency);
  const unit = 1 / 10 ** decimals;
  let raw: number[];

  if (method === "equal") {
    raw = inputs.map(() => total / inputs.length);
  } else if (method === "exact") {
    raw = inputs.map((input) => input.value ?? 0);
    const allocated = roundMoney(raw.reduce((sum, value) => sum + value, 0), currency);
    if (Math.abs(allocated - roundMoney(total, currency)) >= unit) {
      throw new Error("Exact amounts must add up to the record total.");
    }
  } else if (method === "percentage") {
    const percentage = inputs.reduce((sum, input) => sum + (input.value ?? 0), 0);
    if (Math.abs(percentage - 100) > 0.01) {
      throw new Error("Percentages must add up to 100%.");
    }
    raw = inputs.map((input) => total * ((input.value ?? 0) / 100));
  } else {
    const shares = inputs.reduce((sum, input) => sum + (input.value ?? 0), 0);
    if (shares <= 0) throw new Error("Shares must add up to more than zero.");
    raw = inputs.map((input) => total * ((input.value ?? 0) / shares));
  }

  const rounded = raw.map((value) => roundMoney(value, currency));
  const remainder = roundMoney(total - rounded.reduce((sum, value) => sum + value, 0), currency);
  rounded[0] = roundMoney(rounded[0] + remainder, currency);

  return inputs.map((input, index) => ({
    recordId,
    memberId: input.memberId,
    splitMethod: method,
    owedAmount: rounded[index],
    percentage: method === "percentage" ? input.value : undefined,
    shares: method === "shares" ? input.value : undefined,
  }));
}

export function eventNetBalances(
  eventId: string,
  members: EventMember[],
  records: LedgerRecord[],
  settlements: Settlement[],
) {
  const balances = new Map(
    members.filter((member) => member.eventId === eventId).map((member) => [member.id, 0]),
  );

  for (const record of records.filter((item) => item.eventId === eventId)) {
    applyRecordBalance(balances, record, record.payerId);
  }

  for (const settlement of settlements) {
    const allocation = settlement.events.find((item) => item.eventId === eventId);
    if (!allocation) continue;
    const fromUserId = members.find((member) => member.id === settlement.fromMemberId)?.userId;
    const toUserId = members.find((member) => member.id === settlement.toMemberId)?.userId;
    const fromMemberId = members.find((member) => member.eventId === eventId && member.userId === fromUserId)?.id ?? settlement.fromMemberId;
    const toMemberId = members.find((member) => member.eventId === eventId && member.userId === toUserId)?.id ?? settlement.toMemberId;
    balances.set(
      fromMemberId,
      (balances.get(fromMemberId) ?? 0) + allocation.allocatedAmount,
    );
    balances.set(
      toMemberId,
      (balances.get(toMemberId) ?? 0) - allocation.allocatedAmount,
    );
  }

  return balances;
}

export function groupDailyNetBalances(
  groupId: string,
  currency: CurrencyCode,
  members: GroupMember[],
  records: LedgerRecord[],
) {
  const balances = new Map(
    members
      .filter((member) => member.groupId === groupId && member.status === "active")
      .map((member) => [member.id, 0]),
  );

  for (const record of records.filter(
    (item) => item.groupId === groupId && !item.eventId && item.baseCurrency === currency,
  )) {
    applyRecordBalance(balances, record, record.payerId);
  }

  return balances;
}

export interface Debt {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export function simplifyBalances(
  balances: Map<string, number>,
  currency: CurrencyCode,
): Debt[] {
  const threshold = 1 / 10 ** currencyDecimals(currency);
  const debtors = [...balances]
    .filter(([, amount]) => amount < -threshold / 2)
    .map(([id, amount]) => ({ id, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = [...balances]
    .filter(([, amount]) => amount > threshold / 2)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debts: Debt[] = [];

  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = roundMoney(Math.min(debtor.amount, creditor.amount), currency);
    if (amount >= threshold) {
      debts.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amount });
    }
    debtor.amount = roundMoney(debtor.amount - amount, currency);
    creditor.amount = roundMoney(creditor.amount - amount, currency);
    if (debtor.amount < threshold) debtorIndex += 1;
    if (creditor.amount < threshold) creditorIndex += 1;
  }
  return debts;
}

export function totalEventSpending(eventId: string, records: LedgerRecord[]) {
  return records
    .filter((record) => record.recordType === "expense" && record.eventId === eventId)
    .reduce((sum, record) => sum + record.amountBase, 0);
}

export function totalGroupDailySpending(
  groupId: string,
  currency: CurrencyCode,
  records: LedgerRecord[],
) {
  return records
    .filter(
      (record) =>
        record.recordType === "expense" && record.groupId === groupId && !record.eventId && record.baseCurrency === currency,
    )
    .reduce((sum, record) => sum + record.amountBase, 0);
}
