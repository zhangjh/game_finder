// server 生产配置：standalone 输出（配合 Dockerfile）
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
