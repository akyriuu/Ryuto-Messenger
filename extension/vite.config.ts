import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: `dist-${mode}`,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'index.html',
        ...(mode === 'chrome' ? { background: 'src/background.ts' } : {}),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
