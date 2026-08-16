import type { Category } from "./types";

export const defaultCategories: Category[] = [
  ["income", "Income", "💵"],
  ["transfer", "Transfer", "↔️"],
  ["food", "Food & Dining", "🍽️"],
  ["accommodation", "Accommodation", "🏨"],
  ["flights", "Flights", "✈️"],
  ["public-transport", "Public Transportation", "🚆"],
  ["taxi", "Taxi / Ride Share", "🚕"],
  ["fuel", "Fuel", "⛽"],
  ["parking", "Parking", "🅿️"],
  ["groceries", "Groceries", "🛒"],
  ["shopping", "Shopping", "🛍️"],
  ["entertainment", "Entertainment", "🎟️"],
  ["attractions", "Attractions", "🏛️"],
  ["housing", "Housing", "🏠"],
  ["utilities", "Utilities", "💡"],
  ["gifts", "Gifts", "🎁"],
  ["business", "Business", "💼"],
  ["electronics", "Electronics", "📱"],
  ["fees", "Fees", "💰"],
  ["other", "Other", "🧾"],
].map(([id, name, emoji]) => ({ id, name, emoji, isCustom: false }));
