import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers/providers";
import { ServiceWorkerRegister } from "@/components/providers/service-worker-register";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Bill Moshi", template: "%s · Bill Moshi" },
  description: "Friendly group expense sharing with Google-owned storage.",
  applicationName: "Bill Moshi",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bill Moshi" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} antialiased`}>
      <body>
        <Providers>
          <ServiceWorkerRegister />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
