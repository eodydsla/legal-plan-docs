import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 행정계획 원문 PDF를 관리자에서 올린다. 기본 1MB로는 어림도 없다.
    serverActions: { bodySizeLimit: "80mb" },
  },
  /* config options here */
};

export default nextConfig;
