import os from "node:os";
import type { NextConfig } from "next";

function collectAllowedDevOrigins() {
  const detectedIpv4Hosts = Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);

  const envHosts = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(["localhost", "127.0.0.1", ...detectedIpv4Hosts, ...envHosts])];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: collectAllowedDevOrigins(),
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
