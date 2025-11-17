import { headers } from 'next/headers';
import { getTranslations } from '@/lib/i18n/server';

export async function getServerTranslations(ns = 'common') {
  const headersList = await headers();
  const locale = headersList.get('x-next-locale') || 'en';
  return getTranslations(locale, ns);
}