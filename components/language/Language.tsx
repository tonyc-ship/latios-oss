'use client';
import i18n from '@/lib/i18n/client';
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n: instance } = useTranslation();

  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={() => instance.changeLanguage('en')}>EN</button>
      <button onClick={() => instance.changeLanguage('zh')}>ZH</button>
    </div>
  );
}