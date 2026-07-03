import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.APP_URL': JSON.stringify(process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500, // Increased to hide the Vercel warning
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'firebase/firestore', 'firebase/auth', 'firebase/app', 'lucide-react', 'motion'],
            solana: ['@solana/web3.js', 'bs58', '@jup-ag/api']
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
