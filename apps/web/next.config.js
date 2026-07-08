const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this monorepo. Without this, a stray
  // package-lock.json in the home directory makes Next infer the wrong root,
  // which breaks _next static asset serving (404s on chunks/CSS).
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

// Optional: enable PWA in production
// const withPWA = require('next-pwa')({
//   dest: 'public',
//   disable: process.env.NODE_ENV === 'development',
// });
// module.exports = withPWA(nextConfig);

module.exports = nextConfig;
