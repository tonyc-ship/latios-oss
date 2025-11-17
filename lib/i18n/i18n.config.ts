export const i18nConfig = {
    // 支持的语言列表
    supportedLocales: ['en', 'zh'],
    
    // 默认语言
    defaultLocale: 'en',
    
    // i18next共享配置
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