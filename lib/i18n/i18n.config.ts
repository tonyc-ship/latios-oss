export const i18nConfig = {
    // Supported language list
    supportedLocales: ['en', 'zh'],
    
    // Default language
    defaultLocale: 'en',
    
    // i18next shared configuration
    i18nextConfig: {
      defaultNS: 'common',
      fallbackLng: 'en',
      supportedLngs: ['en', 'zh'],
      interpolation: {
        escapeValue: false,
        prefix: '{',
        suffix: '}'
      },
      debug: false
    }
  };