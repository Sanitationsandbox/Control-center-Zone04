import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["cloudinary", "pg", "ws"],
};

export default nextConfig;
