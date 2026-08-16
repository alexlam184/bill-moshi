import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bill Moshi — Shared Expenses",
    short_name: "Bill Moshi",
    description: "Split group expenses, track balances, and settle up anywhere.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#6EBBF1",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
