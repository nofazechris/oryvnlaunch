/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The web app is a workspace package; trace the monorepo root for output file tracing.
  outputFileTracingRoot: process.cwd() + "/../../",
};

export default nextConfig;
