'use client';

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Library, Search, Menu, X, Headphones } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function TopNavbar() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNavClick = () => {
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
  };

  // 移动端直接跳转到搜索页面
  const handleMobileSearch = () => {
    router.push('/search');
  };





  return (
    <>
      {/* Top navigation bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            {/* Left: Logo + Navigation menu */}
            <div className="flex items-center space-x-8">
              <div className="text-xl font-bold" onClick={() => router.push('/')}>
                <Image src="/full_logo.png" alt="Latios" width={70} height={24} />
              </div>

              {/* Desktop navigation menu */}
              <div className="hidden md:flex items-center space-x-6">
                <Link
                  href="/podcast"
                  className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  onClick={handleNavClick}
                >
                  <Headphones className="h-4 w-4" />
                  <span>{t('common.podcast')}</span>
                </Link>
                <Link
                  href="/library"
                  className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  onClick={handleNavClick}
                >
                  <Library className="h-4 w-4" />
                  <span>{t('common.library')}</span>
                </Link>
              </div>
            </div>

            {/* Right: User info */}
            <div className="hidden md:flex items-center space-x-4">
              {/* Profile link removed */}
            </div>

            {/* Mobile right button group */}
            <div className="md:hidden flex items-center space-x-2">
              {/* Mobile search button */}
              <button
                onClick={handleMobileSearch}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
                title={t('dashboard.searchPlaceholder')}
              >
                <Search className="h-4 w-4 text-gray-500" />
              </button>
              
              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobile && isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link
                href="/podcast"
                className="flex items-center space-x-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium"
                onClick={handleNavClick}
              >
                <Headphones className="h-5 w-5" />
                <span>{t('common.podcast')}</span>
              </Link>
              <Link
                href="/library"
                className="flex items-center space-x-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium"
                onClick={handleNavClick}
              >
                <Library className="h-5 w-5" />
                <span>{t('common.library')}</span>
              </Link>
              {/* Profile section removed */}
            </div>
          </div>
        )}
      </div>

      {/* Mobile overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

    </>
  );
} 