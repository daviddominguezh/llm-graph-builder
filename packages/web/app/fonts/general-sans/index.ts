import localFont from 'next/font/local';

export const generalSans = localFont({
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
  src: [
    { path: './GeneralSans-200.woff2', weight: '200', style: 'normal' },
    { path: './GeneralSans-200i.woff2', weight: '200', style: 'italic' },
    { path: './GeneralSans-300.woff2', weight: '300', style: 'normal' },
    { path: './GeneralSans-300i.woff2', weight: '300', style: 'italic' },
    { path: './GeneralSans-400.woff2', weight: '400', style: 'normal' },
    { path: './GeneralSans-400i.woff2', weight: '400', style: 'italic' },
    { path: './GeneralSans-500.woff2', weight: '500', style: 'normal' },
    { path: './GeneralSans-500i.woff2', weight: '500', style: 'italic' },
    { path: './GeneralSans-600.woff2', weight: '600', style: 'normal' },
    { path: './GeneralSans-600i.woff2', weight: '600', style: 'italic' },
    { path: './GeneralSans-700.woff2', weight: '700', style: 'normal' },
    { path: './GeneralSans-700i.woff2', weight: '700', style: 'italic' },
  ],
});
