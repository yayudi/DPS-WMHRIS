// vite.cofig.js
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: '/',

  plugins: [vue(), vueDevTools()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // --- OPTIMASI BUILD (Solusi "Large Chunk Warning") ---
  build: {
    // Naikkan limit warning sedikit (opsional, untuk menghilangkan noise log)
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        // Logika pemisahan file vendor (library) dari kode aplikasi
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Pisahkan Core Vue & State Management agar browser bisa cache permanen
            if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
              return 'vue-vendor'
            }

            // Pisahkan Library UI berat (seperti FontAwesome atau Chart.js)
            if (id.includes('@fortawesome') || id.includes('fontawesome')) {
              return 'ui-vendor'
            }

            // Sisanya masuk ke file vendor umum
            return 'vendor'
          }
        },
      },
    },
  },

  // --- DEV SERVER CONFIG ---
  server: {
    port: 5173,
    proxy: {
      // Mengarahkan request API ke Backend Node.js
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Mengarahkan request gambar/file statis ke folder public Backend
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
