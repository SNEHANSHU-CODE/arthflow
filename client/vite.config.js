import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: [
          '**/node_modules/**/*',
          '**/sw.js',
          '**/workbox-*.js'
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.yourapp\.com\/.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Arthflow - Personal Money Manager',
        short_name: 'Arthflow',
        description: 'Empower your financial life with smart tracking and goal setting',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['finance', 'productivity', 'business', 'utilities'],
        shortcuts: [
          {
            name: 'Add Transaction',
            short_name: 'Add',
            description: 'Quickly add a new transaction',
            url: '/transactions/add',
            icons: [{ src: '/icons/add-transaction.png', sizes: '192x192' }]
          },
          {
            name: 'View Budget',
            short_name: 'Budget',
            description: 'Check your budget status',
            url: '/budget',
            icons: [{ src: '/icons/budget.png', sizes: '192x192' }]
          }
        ],
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        protocol_handlers: [
          {
            protocol: 'web+arthflow',
            url: '/import?data=%s'
          }
        ]
      },
      // Enable in development for testing
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts']
        }
      }
    }
  }
})
