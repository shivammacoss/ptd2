/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
  },
  // API proxy: use src/app/api/v1/[...path]/route.ts (more reliable than rewrites on Windows)
};

module.exports = nextConfig;
