import { createInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { i18nConfig } from '@/lib/i18n/i18n.config';

export async function createI18nInstance(locale: string, namespace: string = 'common') {
  const i18n = createInstance();

  await i18n
    .use(
      resourcesToBackend((lng: string, ns: string) => {
        return import(`../../locales/${lng}/${ns}.json`);
      })
    )
    .init({
      ...i18nConfig.i18nextConfig,
      lng: locale,
      ns: [namespace],
    });

  return i18n;
}

export async function getTranslations(locale: string, ns: string = 'common') {
  const i18n = await createI18nInstance(locale, ns);
  return {
    t: i18n.t.bind(i18n),
    locale,
  };
}