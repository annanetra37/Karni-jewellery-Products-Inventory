/** @type {import('next').NextConfig} */
// Run the whole server in Yerevan time so every server-rendered timestamp and
// all day-boundary math (today's sales, shifts, reconciliation) is in Yerevan.
// Evaluated when `next start` boots the server process, before any request.
process.env.TZ = 'Asia/Yerevan';

const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
};
module.exports = nextConfig;
