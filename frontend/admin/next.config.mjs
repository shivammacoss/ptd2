/** @type {import('next').NextConfig} */
// Baked at `next build`; use .env.local GATEWAY_INTERNAL_URL=http://127.0.0.1:8000 for local `next dev`.
const gatewayTarget = process.env.GATEWAY_INTERNAL_URL || 'http://gateway:8000';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${gatewayTarget.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
