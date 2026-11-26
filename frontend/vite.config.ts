import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { defineConfig, loadEnv, type ConfigEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Inline Vite plugin: swap favicon to favicon-dev.ico in dev mode
 * so browser tabs clearly show which instance is DEV vs PROD.
 */
const faviconPlugin = ({ command }: Pick<ConfigEnv, 'command'>): Plugin => ({
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

/**
 * Package -> chunk mapping. Hanya package yang terdaftar yang dipaksa ke chunk bernama;
 * sisanya diserahkan ke algoritma code-splitting Rollup (mengikuti batas dynamic import).
 */
const CHUNK_MAP = new Map<string, string>(
  Object.entries({
    // ── Core startup (dimuat di setiap halaman) ──────────────────────
    'vue-vendor': [
      'vue',
      'vue-router',
      'pinia',
      'vue-demi',
      '@vueuse/core',
      '@vueuse/shared'
    ],
    tanstack: [
      '@tanstack/vue-query',
      '@tanstack/query-core',
      '@tanstack/vue-table',
      '@tanstack/table-core',
      '@tanstack/vue-virtual',
      '@tanstack/virtual-core'
    ],
    fontawesome: [
      '@fortawesome/fontawesome-svg-core',
      '@fortawesome/free-solid-svg-icons',
      '@fortawesome/free-brands-svg-icons',
      '@fortawesome/vue-fontawesome'
    ],
    firebase: [
      'firebase',
      '@firebase/app',
      '@firebase/database',
      '@firebase/util',
      '@firebase/component',
      '@firebase/logger'
    ],
    'app-vendor': [
      'axios',
      'dayjs',
      'nprogress',
      'sweetalert2',
      'zod',
      '@floating-ui/vue',
      '@floating-ui/dom',
      '@floating-ui/core',
      '@floating-ui/utils'
    ],

    // ── Lazy / heavy (hanya dimuat oleh halaman tertentu) ────────────
    charts: ['apexcharts', 'vue3-apexcharts'],
    spreadsheet: ['jspreadsheet-ce', 'jsuites', '@jspreadsheet/formula'],
    xlsx: ['xlsx'],
    'pdf-vendor': ['pdfjs-dist'],
    fabric: ['fabric'],
    jszip: ['jszip'],
    'qr-scanner': ['jsqr'],
    'image-tools': ['browser-image-compression'],
    barcode: ['jsbarcode', 'qrcode', 'dijkstrajs']
  }).flatMap(([chunk, pkgs]) => pkgs.map(pkg => [pkg, chunk]))
)

/**
 * Ekstrak nama package dari module id (aman untuk npm, pnpm (.pnpm), dan scoped package).
 */
const getPackageName = (id: string): string | undefined => {
  const normId = id.replace(/\\/g, '/')
  const idx = normId.lastIndexOf('/node_modules/')
  if (idx === -1) return undefined
  const sub = normId.slice(idx + '/node_modules/'.length)
  const parts = sub.split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_API_BASE_URL && env.VITE_API_BASE_URL !== '/api' 
    ? env.VITE_API_BASE_URL.replace(/\/api\/?$/, '') 
    : 'http://localhost:3000'

  const isTest = mode === 'test'
  const isProdBuild = command === 'build' && mode === 'production'

  return {
    base: '/',

    ...(isProdBuild
      ? {
          esbuild: {
            pure: ['console.log', 'console.info', 'console.debug', 'console.warn'],
            drop: ['debugger']
          }
        }
      : {}),

    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag.startsWith('cropper-')
          }
        }
      }),
      !isTest && vueDevTools(),
      command === 'build' && !isTest && visualizer({ filename: 'bundle-stats.html' }),
      faviconPlugin({ command }),
      !isTest &&
        VitePWA({
        // devOptions: {
        //   enabled: true,
        //   type: 'module'
        // },
        registerType: 'prompt',
        includeAssets: [
          'favicon.ico',
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
            if (id.includes('vite/preload-helper')) {
              return 'vue-vendor'
            }

            const pkg = getPackageName(id)
            if (!pkg) return undefined

            if (pkg.startsWith('@vue/')) {
              return 'vue-vendor'
            }
            if (pkg.startsWith('@firebase/')) {
              return 'firebase'
            }

            return CHUNK_MAP.get(pkg)
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
