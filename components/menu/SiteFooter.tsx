"use client";

import { Mail } from "lucide-react";
import { FaDiscord, FaXTwitter } from "react-icons/fa6";

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <a
            href="https://discord.gg/phmjEwvQ4h"
            className="p-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
          >
            <FaDiscord size={20} />
            <span className="sr-only">Discord</span>
          </a>
          <a
            href="https://x.com/latios_ai"
            className="p-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
          >
            <FaXTwitter size={20} />
            <span className="sr-only">X</span>
          </a>
          <a
            href="mailto:team@surrealx.ai"
            className="p-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label="Email"
          >
            <Mail className="h-5 w-5" />
            <span className="sr-only">Email</span>
          </a>
        </div>
        <div className="text-sm text-gray-500">
          © {new Date().getFullYear()} Latios AI 
        </div>
      </div>
    </footer>
  );
}

