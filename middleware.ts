import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { i18nConfig } from '@/lib/i18n/i18n.config';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Handle i18n language redirect logic
  const i18nResult = handleI18nRedirect(request, pathname);
  if (i18nResult) {
    return i18nResult;
  }

  // Continue with normal access
  return NextResponse.next();
}

/**
 * Handle i18n language redirect logic
 * @param request NextRequest object
 * @param pathname Current path
 * @returns NextResponse | null - Returns Response if redirect needed, otherwise null
 */
function handleI18nRedirect(request: NextRequest, pathname: string): NextResponse | null {
  // Skip API routes and static files
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.includes('.')) {
    return null;
  }

  let locale = i18nConfig.defaultLocale;
  
  // Use browser language
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    // Get browser's preferred language (remove locale suffix, e.g., 'en-US' becomes 'en')
    const browserLocale = acceptLanguage.split(',')[0].split('-')[0];
    // Check if the language is supported
    if (i18nConfig.supportedLocales.includes(browserLocale)) {
      locale = browserLocale;
    }
  }

  const response = NextResponse.next();
  response.headers.set('x-next-locale', locale);
  return response;
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    // Skip all API routes
    // Skip all static files
    '/((?!_next|api|.*\\..*).*)',
  ],
};