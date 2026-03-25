/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://gateway:8000/api/:path*',
      },
      {
        source: '/admin-api/:path*',
        destination: 'http://admin-api:8001/api/v1/admin/:path*',
      },
    ];
  },
};

export default nextConfig;
