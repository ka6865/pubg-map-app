import type { NextConfig } from "next";

const isExport = process.env.BUILD_MODE === 'export';

const nextConfig: NextConfig = {
  output: isExport ? 'export' : undefined,
  trailingSlash: false,
  allowedDevOrigins: ['localhost:3000', '127.0.0.1:3000'],
  images: {
    unoptimized: isExport ? true : false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
