import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Resolves the request config at ./i18n/request.ts (next-intl's default path).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
