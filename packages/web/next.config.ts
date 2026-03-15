import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const withNextIntl = createNextIntlPlugin('./app/i18n/request.ts');

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(currentDir, '../api/src');
const graphTypesSrc = path.resolve(currentDir, '../graph-types/src');

interface WebpackResolve {
  alias?: Record<string, string>;
  extensionAlias?: Record<string, string[]>;
}

interface WebpackConfig {
  resolve?: WebpackResolve;
}

function configureWebpack(config: WebpackConfig): WebpackConfig {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@daviddh/graph-types': path.join(graphTypesSrc, 'index.ts'),
        '@daviddh/llm-graph-runner': path.join(apiSrc, 'index.ts'),
        '@src': apiSrc,
      },
      extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    },
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@daviddh/graph-types', '@daviddh/llm-graph-runner'],
  images: { localPatterns: [{ pathname: '/supabase-storage/**' }, { pathname: '/*.avif' }] },
  devIndicators: false,
  webpack: configureWebpack,
  rewrites() {
    return [
      {
        source: '/supabase-storage/:path*',
        destination: `${supabaseUrl}/storage/v1/object/public/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
