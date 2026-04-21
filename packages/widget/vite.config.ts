import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'loader') {
    return {
      build: {
        lib: {
          entry: 'src/loader/script.ts',
          formats: ['iife'],
          name: 'OpenFlowWidget',
          fileName: () => 'script.js',
        },
        emptyOutDir: false,
      },
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
    build: {
      rollupOptions: { input: 'index.html' },
      emptyOutDir: false,
    },
  };
});
