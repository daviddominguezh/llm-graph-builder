import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';

import './globals.css';

import { AnalyticsClient } from './components/AnalyticsClient';
import { FilmGrain } from './components/FilmGrain';
import { SmoothScroll } from './components/SmoothScroll';

// Aeonik (static weights 100–900, normal + italic) served locally from app/fonts.
const aeonik = localFont({
  variable: '--font-aeonik',
  display: 'swap',
  src: [
    { path: './fonts/Aeonik-Air.ttf', weight: '100', style: 'normal' },
    { path: './fonts/Aeonik-AirItalic.ttf', weight: '100', style: 'italic' },
    { path: './fonts/Aeonik-Thin.ttf', weight: '200', style: 'normal' },
    { path: './fonts/Aeonik-ThinItalic.ttf', weight: '200', style: 'italic' },
    { path: './fonts/Aeonik-Light.ttf', weight: '300', style: 'normal' },
    { path: './fonts/Aeonik-LightItalic.ttf', weight: '300', style: 'italic' },
    { path: './fonts/Aeonik-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Aeonik-RegularItalic.ttf', weight: '400', style: 'italic' },
    { path: './fonts/Aeonik-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Aeonik-MediumItalic.ttf', weight: '500', style: 'italic' },
    { path: './fonts/Aeonik-Bold.ttf', weight: '700', style: 'normal' },
    { path: './fonts/Aeonik-BoldItalic.ttf', weight: '700', style: 'italic' },
    { path: './fonts/Aeonik-Black.ttf', weight: '900', style: 'normal' },
    { path: './fonts/Aeonik-BlackItalic.ttf', weight: '900', style: 'italic' },
  ],
});
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OpenFlow | AI Cloud',
  description:
    'Build an AI agent, connect WhatsApp, Slack, or a chatbot — and each of your customers gets their own isolated instance. Multi-tenant from day one. MIT licensed.',
  // Theme-aware favicon: the browser tab bar follows the browser color scheme,
  // so serve the black icon on light and the white icon on dark. Defining
  // `icons` here disables Next's automatic app/icon.png detection.
  icons: {
    icon: [
      { url: '/iconBlack.png', media: '(prefers-color-scheme: light)' },
      { url: '/iconWhite.png', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${aeonik.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <NextIntlClientProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </NextIntlClientProvider>
        <FilmGrain />
        <AnalyticsClient />
      </body>
    </html>
  );
}
