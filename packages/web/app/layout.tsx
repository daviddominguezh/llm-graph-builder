import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import { Geist_Mono } from 'next/font/google';

import { GlassFilters } from '@/components/ui/glass-panel';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

import { AnalyticsClient } from './components/AnalyticsClient';
import { CssVarsLogger } from './components/CssVarsLogger';
import { GlobalScrollbarOverlay } from './components/GlobalScrollbarOverlay';
import { OpenRouterModelsLogger } from './components/OpenRouterModelsLogger';
import { ThemeProvider } from './components/ThemeProvider';
import { generalSans } from './fonts/general-sans';

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const APPLE_UA_PATTERN = /Macintosh|Mac OS X|iPhone|iPad|iPod/;

export const metadata: Metadata = {
  title: "OpenFlow",
  description: "LLM State machine builder",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') ?? '';
  const isAppleDevice = APPLE_UA_PATTERN.test(userAgent);

  return (
    <html
      lang={locale}
      className={`${generalSans.variable} ${geistMono.variable}`}
      data-platform={isAppleDevice ? 'apple' : undefined}
      suppressHydrationWarning
    >
      <body className="antialiased overflow-hidden">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <GlobalScrollbarOverlay />
            <OpenRouterModelsLogger />
            <CssVarsLogger />
            {children}
            <GlassFilters />
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
        <AnalyticsClient />
      </body>
    </html>
  );
}
