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
      define: {
        'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY),
        'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY),
        'process.env.VIDEO_API_KEY': JSON.stringify(env.VIDEO_API_KEY),
        'process.env.AUDIO_API_KEY': JSON.stringify(env.AUDIO_API_KEY),
        
        // Polo Keys
        'process.env.POLO_TEXT_API_KEY': JSON.stringify(env.POLO_TEXT_API_KEY),
        'process.env.POLO_IMAGE_API_KEY': JSON.stringify(env.POLO_IMAGE_API_KEY),
        'process.env.POLO_VIDEO_API_KEY': JSON.stringify(env.POLO_VIDEO_API_KEY),

        // T8Star Keys
        'process.env.T8_TEXT_API_KEY': JSON.stringify(env.T8_TEXT_API_KEY),
        'process.env.T8_IMAGE_API_KEY': JSON.stringify(env.T8_IMAGE_API_KEY),
        'process.env.T8_VIDEO_API_KEY': JSON.stringify(env.T8_VIDEO_API_KEY),
        'process.env.T8_AUDIO_API_KEY': JSON.stringify(env.T8_AUDIO_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
