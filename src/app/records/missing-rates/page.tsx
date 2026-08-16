import type { Metadata } from "next";
import { MissingExchangeRatesScreen } from "@/components/screens/missing-exchange-rates-screen";

export const metadata: Metadata = { title: "Missing exchange rates" };

export default function MissingExchangeRatesPage() {
  return <MissingExchangeRatesScreen />;
}
