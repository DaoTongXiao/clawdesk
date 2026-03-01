import type { NextConfig } from "next";

const isDesktopBuild = process.env.TAURI_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isDesktopBuild
    ? {
        output: "export",
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;
