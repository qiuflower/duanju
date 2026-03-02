import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/t8star': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
          timeout: 300000, // 5 minutes
          proxyTimeout: 300000, // 5 minutes
          // rewrite: (path) => path.replace(/^\/api\/t8star/, '') // Don't rewrite, let backend handle it
        },
        '/api/polo': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
          timeout: 300000, // 5 minutes
          proxyTimeout: 300000, // 5 minutes
          // rewrite: (path) => path.replace(/^\/api\/polo/, '') // Don't rewrite, let backend handle it
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    },
    build: {
      chunkSizeWarningLimit: 1000,
    }
  };
});
