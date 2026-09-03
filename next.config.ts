import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "10.0.0.100",
    "http://localhost:3000",
    "localhost.bill-moshi",
  ],
};

export default nextConfig;
