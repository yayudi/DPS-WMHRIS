// vite.config.js
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Inline Vite plugin: swap favicon to favicon-dev.ico in dev mode
 * so browser tabs clearly show which instance is DEV vs PROD.
 * @param {{ command: string }} env
 * @returns {import('vite').Plugin}
 */
const faviconPlugin = ({ command }) => ({
  name: 'favicon-env',
  transformIndexHtml: html => {
    if (command === 'serve') {
      // Replace any <link rel="icon" ...> with the dev favicon
      return html.replace(
        /(<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["'])[^"']+?(["'][^>]*>)/gi,
        '$1/favicon-dev.ico$2'
      )
    }
    return html
  }
})

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_API_BASE_URL ? env.VITE_API_BASE_URL.replace(/\/api\/?$/, '') : 'http://localhost:3000'

  return {
    base: '/',

    esbuild: {
      pure: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      drop: ['debugger']
    },

    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag.startsWith('cropper-')
          }
        }
      }),
      vueDevTools(),
      visualizer({ filename: 'bundle-stats.html' }),
      faviconPlugin({ command }),
      VitePWA({
        // devOptions: {
        //   enabled: true,
        //   type: 'module'
        // },
        registerType: 'prompt',
        includeAssets: [
          'favicon-prod.ico',
          'favicon-16x16.png',
          'favicon-32x32.png',
          'apple-touch-icon.png',
          'android-chrome-192x192.png',
          'android-chrome-512x512.png'
        ],
        manifest: {
          name: 'DPS Office - WMS & HRIS',
          short_name: 'DPS Office',
          description: 'Warehouse Management & HR Information System - Dunia Pratama Sejahtera',
          theme_color: '#1e293b',
          background_color: '#0f172a',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
                networkTimeoutSeconds: 10
              }
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'media-cache',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/]
        }
      })
    ],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },

    build: {
      chunkSizeWarningLimit: 1000,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
                return 'vue-vendor'
              }
              if (id.includes('xlsx')) return 'xlsx'
              if (id.includes('pdfjs-dist')) return 'pdf-vendor'
              if (id.includes('apexcharts') || id.includes('vue3-apexcharts')) return 'charts'
              if (id.includes('lodash')) return 'lodash'
              if (id.includes('@fortawesome') || id.includes('fontawesome')) {
                return 'fontawesome'
              }
              if (id.includes('axios')) return 'axios'
              if (id.includes('dayjs')) return 'dayjs'
              if (id.includes('sweetalert2')) return 'sweetalert2'
              if (id.includes('fabric')) return 'fabric'
              if (id.includes('jszip')) return 'jszip'
              if (id.includes('@cropper')) return 'cropper'
              if (id.includes('qrcode')) return 'qrcode'
              if (id.includes('firebase')) return 'firebase'
              if (id.includes('@tanstack')) return 'tanstack'
              if (id.includes('jsbarcode')) return 'jsbarcode'
              if (id.includes('nprogress')) return 'nprogress'
              if (id.includes('@floating-ui')) return '@floating-ui'
              if (id.includes('jspreadsheet-ce')) return 'jspreadsheet'
              return 'vendor'
            }
          }
        }
      }
    },

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
