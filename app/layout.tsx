import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { headers } from 'next/headers';
import { ReactNode } from "react";
import { dir } from "i18next";
import { I18nProvider } from "./i18n-provider";
import { GoogleTagManager } from '@next/third-parties/google';
import TopNavbar from "@/components/menu/TopNavbar";
import SiteFooter from "@/components/menu/SiteFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteMetadata = {
  name: "Latios",
  title: "Latios | Your Personal AI Market Research Analyst",
  description: "Your Personal AI Market Research Analyst, transform key leaders' opinions into market insights",
  keywords: "podcast transcription, AI Summary, Podcast Summary, Tech News, startup news, vc news, AI technology, ai news, vc podcast, tech show, Tech podcast, latios, latios.ai, 播客转录、人工智能摘要、播客摘要、科技新闻、创业新闻、风投新闻、人工智能技术、人工智能新闻、风投播客、科技节目、科技播客、latios、latios.AI",
  domain: "latios.ai",
};


export async function generateMetadata(): Promise<Metadata> {
  return {
    title: siteMetadata.title,
    description: siteMetadata.description,
    keywords: siteMetadata.keywords,
    alternates: {
      canonical: `https://${siteMetadata.domain}`,
      languages: {
        'en': 'https://latios.ai',
        'zh': 'https://latios.ai',
      },
    },
    openGraph: {
      title: siteMetadata.title,
      description: siteMetadata.description,
      url: `https://${siteMetadata.domain}`,
      siteName: siteMetadata.name,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: siteMetadata.title,
      description: siteMetadata.description,
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir={dir('en')} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={siteMetadata.description || ""} />
        <title>{String(siteMetadata.title || "")}</title>

        {/* Basic SEO */}
        <meta name="keywords" content="AI, summaries, artificial intelligence, content summarization" />
        <meta name="author" content="Latios" />
        <meta name="robots" content="index, follow" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={String(siteMetadata.title || "")} />
        <meta property="og:description" content={String(siteMetadata.description || "")} />
        <meta property="og:site_name" content={siteMetadata.name} />
        <meta property="og:url" content={`https://${siteMetadata.domain}`} />
        <meta property="og:image" content="https://latios.ai/logo.png" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={String(siteMetadata.title || "")} />
        <meta name="twitter:description" content={String(siteMetadata.description || "")} />
        <meta name="twitter:image" content="https://latios.ai/logo.png" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo.png" />

        {/* Canonical URL */}
        <link rel="canonical" href={`https://${siteMetadata.domain}`} />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Latios",
            "url": "https://latios.ai",
            "logo": "https://latios.ai/favicon.ico"
          }) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "url": "https://latios.ai",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://latios.ai/search?query={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          }) }}
        />
        
        {/* Google Analytics */}
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_TRACKING_ID || 'G-TQCKR7HNR2'}`}></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_TRACKING_ID || 'G-TQCKR7HNR2'}');
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GA_TRACKING_ID || "G-LHBKHH3ZDQ"} />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
        >
          <AuthProvider>
            <I18nProvider>
            <div className="min-h-screen bg-gray-50 overflow-hidden z-1">
            {/* 顶部导航栏 */}
            <TopNavbar />
            
            {/* 内容区域 */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
            <SiteFooter />
          </div>
            </I18nProvider>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
