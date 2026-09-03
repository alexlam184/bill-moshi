"use client";

import { useEffect, type ReactNode } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";

export default function RecurringLayout({ children }: { children: ReactNode }) {
  const { selectPersonal } = useBillMoshi();
  useEffect(() => { selectPersonal(); }, [selectPersonal]);
  return children;
}
