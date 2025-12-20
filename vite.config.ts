import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
          manifest: {
            id: '/Enforcer/',
            display: "fullscreen",
            name: 'Enforcer',
            short_name: 'Enforcer',
            description: 'Mini Fighting Game in the style of classic 90s arcade games.',
            theme_color: '#ffffff',
            icons: [
              {
                src: '/Enforcer/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: '/Enforcer/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: "/Enforcer/favicon.svg",
                sizes: "any",
                type: "image/svg+xml"
              }
            ],
             screenshots: [
          {
            src: "/Enforcer/desktop_wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "App on desktop"
          },
            {
            src: "/Enforcer/Mobile.png",
            sizes: "556x340",
            type: "image/png",
            form_factor: "narrow",
            label: "Mobile View"
          }
        ]
          }
        })
      ],
      base: "/Enforcer",
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
