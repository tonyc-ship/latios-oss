"use client";

import { ReactNode, useEffect, useState } from 'react';
import i18n from '@/lib/i18n/client';
import { I18nextProvider } from 'react-i18next';
import { i18nConfig } from '@/lib/i18n/i18n.config';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeI18n = async () => {
      if (!i18n.isInitialized) {
        let defaultLng = i18nConfig.defaultLocale;
        
        // 使用浏览器语言
        const browserLang = navigator.language;
        const browserLocale = browserLang.split('-')[0];
        if (i18nConfig.supportedLocales.includes(browserLocale)) {
          defaultLng = browserLocale;
        }

        try {
          await i18n.init({
            ...i18nConfig.i18nextConfig,
            lng: defaultLng,
          });
          // console.log("i18n initialized with language:", defaultLng);
          setIsInitialized(true);
        } catch (error) {
          console.error("Failed to initialize i18n:", error);
        }
      } else {
        setIsInitialized(true);
      }
    };

    initializeI18n();
  }, []);

  if (!isInitialized) {
    return <></>;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}