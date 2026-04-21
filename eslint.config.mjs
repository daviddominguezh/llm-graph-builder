import js from '@eslint/js';
import love from 'eslint-config-love';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: ['coverage/**', 'dist/**', '**/dist/**', 'node_modules/**', '**/node_modules/**', '**/.next/**', '*.config.js', '*.config.ts', 'examples/**', '**/lib/dagre.js', '**/next-env.d.ts', 'packages/backend/scripts/**'],
  },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js }, extends: ['js/recommended'] },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], languageOptions: { globals: globals.node } },
  {
    ...love,
    files: ['**/*.{ts,mts,cts}'],
  },
  tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    rules: {
      // Our custom rules (preserved)
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', { max: 2 }],
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: true }],
      curly: ['error', 'multi-line'],
    },
  },
  {
    files: ['packages/backend/src/**/*.ts'],
    ignores: [
      'packages/backend/src/routes/auth/**',
      'packages/backend/src/middleware/**',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/db/client.js', '**/db/client'],
          importNames: ['serviceSupabase'],
          message: 'serviceSupabase() is restricted to routes/auth/* and middleware/*',
        }],
      }],
    },
  },
]);
