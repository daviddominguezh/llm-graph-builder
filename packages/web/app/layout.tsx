import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Geist, Geist_Mono, Inter } from 'next/font/google';

import { GlassFilters } from '@/components/ui/glass-panel';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

import { OpenRouterModelsLogger } from './components/OpenRouterModelsLogger';
import { ThemeProvider } from './components/ThemeProvider';

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-hidden`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <OpenRouterModelsLogger />
            {children}
            <GlassFilters />
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
