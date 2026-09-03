import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import Script from "next/script";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers/providers";
import { ServiceWorkerRegister } from "@/components/providers/service-worker-register";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });

const injectedWalletErrorGuard = `
  window.addEventListener("error", function (event) {
    var message = String(event.message || (event.error && event.error.message) || "");

    if (message.indexOf("window.ethereum.selectedAddress = undefined") !== -1) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
`;

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
    <html lang="en" className={`${geist.variable} ${bricolage.variable} antialiased`}>
      <head>
        <Script id="ignore-injected-wallet-error" strategy="beforeInteractive">
          {injectedWalletErrorGuard}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <ServiceWorkerRegister />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
