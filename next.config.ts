import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    TRANSCRIBE_URL: process.env.TRANSCRIBE_URL,
    XIAOYUZHOU_URL: process.env.XIAOYUZHOU_URL,
    SUMMARY_URL: process.env.SUMMARY_URL,
    // SMTP configuration
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
    // Other configuration
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    CRON_AUTH_TOKEN: process.env.CRON_AUTH_TOKEN,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverRuntimeConfig: {
    //apiTimeout: 5 * 60 * 1000,
    apiTimeout: 15 * 60 * 1000,
  },
  allowedDevOrigins: [
    'localhost:3000',
    'latios.ai'
  ],
  images: {
    domains: ['open.weixin.qq.com', 'img.youtube.com'],
  },
};

export default nextConfig;
