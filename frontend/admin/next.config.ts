import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/admin-api/:path*',
        destination: 'http://localhost:8001/admin/:path*',
      },
    ];
  },
};

export default nextConfig;
