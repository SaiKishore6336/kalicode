import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    target: 'chrome130',
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
          terminal: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
