'use client';

import { Toaster } from 'react-hot-toast';
import { useThemeStore } from '@/stores/themeStore';

const lightToast = {
  background: '#ffffff',
  color: '#111827',
  border: '1px solid #E1E5EB',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
};

const darkToast = {
  background: '#151921',
  color: '#E8EAED',
  border: '1px solid #1E2433',
  fontSize: '12px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
};

export default function AppToaster() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: theme === 'dark' ? darkToast : lightToast,
      }}
    />
  );
}
