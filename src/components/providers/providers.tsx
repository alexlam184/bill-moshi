"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { BillMoshiProvider } from "./app-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <BillMoshiProvider>{children}</BillMoshiProvider>
    </SessionProvider>
  );
}
