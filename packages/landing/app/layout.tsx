import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

import { AnalyticsClient } from './components/AnalyticsClient';
import { FilmGrain } from './components/FilmGrain';
import { SmoothScroll } from './components/SmoothScroll';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <SmoothScroll>{children}</SmoothScroll>
        <FilmGrain />
        <AnalyticsClient />
      </body>
    </html>
  );
}
