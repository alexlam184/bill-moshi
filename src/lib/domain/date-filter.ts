export type DateFilterPreset = "all" | "today" | "last7" | "last30" | "month" | "year" | "custom";

export interface DateFilterRange {
  start?: string;
  end?: string;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startDaysBefore(today: Date, days: number) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - days);
  return localDateKey(start);
}

export function dateFilterRange(preset: DateFilterPreset, today = new Date(), custom: DateFilterRange = {}): DateFilterRange {
  const todayKey = localDateKey(today);

  if (preset === "today") return { start: todayKey, end: todayKey };
  if (preset === "last7") return { start: startDaysBefore(today, 6), end: todayKey };
  if (preset === "last30") return { start: startDaysBefore(today, 29), end: todayKey };
  if (preset === "month") return { start: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, end: todayKey };
  if (preset === "year") return { start: `${today.getFullYear()}-01-01`, end: todayKey };
  if (preset === "custom") return custom;
  return {};
}

export function dateInRange(dateValue: string, range: DateFilterRange) {
  const date = dateValue.slice(0, 10);
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}
