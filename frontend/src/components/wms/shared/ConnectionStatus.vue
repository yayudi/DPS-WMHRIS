<!-- frontend/src/components/wms/shared/ConnectionStatus.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from '@/api/axios.js'

const isOnline = ref(true)
const isBackendReachable = ref(true)
const lastCheck = ref(new Date())

let intervalId = null

const checkConnection = async () => {
  // 1. Browser Network Check
  isOnline.value = navigator.onLine

  // 2. Backend Health Check
  if (isOnline.value) {
    try {
      // Menggunakan endpoint ringan (misal: OPTIONS /auth/me atau endpoint khusus health check jika ada)
      // Disini kita coba ping root api atau endpoint yang pasti ada
      await axios.get('/products', { params: { limit: 1 } })
      isBackendReachable.value = true
    } catch (error) {
       // Jika status 401/403 berarti connect tapi auth fail -> itu TERSAMBUNG
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          isBackendReachable.value = true
      } else {
          isBackendReachable.value = false
      }
    }
  } else {
      isBackendReachable.value = false
  }

  lastCheck.value = new Date()
}

onMounted(() => {
  checkConnection()
  // Check every 30 seconds
  intervalId = setInterval(checkConnection, 30000)

  window.addEventListener('online', checkConnection)
  window.addEventListener('offline', checkConnection)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
  window.removeEventListener('online', checkConnection)
  window.removeEventListener('offline', checkConnection)
})
</script>

<template>
  <div
    v-if="!isOnline || !isBackendReachable"
    class="fixed bottom-4 right-4 z-[9999] bg-[hsl(var(--color-background))] shadow-xl border border-[hsl(var(--color-danger))] rounded-xl p-4 flex items-center gap-3 animate-pulse"
  >
    <div class="bg-[hsl(var(--color-danger))/0.1] text-[hsl(var(--color-danger))] w-10 h-10 rounded-full flex items-center justify-center shrink-0">
        <font-awesome-icon icon="fa-solid fa-wifi" class="text-xl" />
    </div>

    <div>
        <h4 class="font-bold text-[hsl(var(--color-danger))] text-sm">Koneksi Terputus</h4>
        <p class="text-xs opacity-70">
            <span v-if="!isOnline">Cek internet Anda.</span>
            <span v-else>Server tidak merespon.</span>
        </p>
    </div>
  </div>
</template>
