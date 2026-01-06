import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/t8star': {
            target: 'https://ai.t8star.cn',
            changeOrigin: true,
            secure: false,
            timeout: 300000, // 5 minutes
            proxyTimeout: 300000, // 5 minutes
            rewrite: (path) => path.replace(/^\/api\/t8star/, '')
          },
          '/api/polo': {
            target: 'https://work.poloapi.com',
            changeOrigin: true,
            secure: false,
            timeout: 300000, // 5 minutes
            proxyTimeout: 300000, // 5 minutes
            rewrite: (path) => path.replace(/^\/api\/polo/, '')
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY),
        'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY),
        'process.env.VIDEO_API_KEY': JSON.stringify(env.VIDEO_API_KEY),
        'process.env.AUDIO_API_KEY': JSON.stringify(env.AUDIO_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
