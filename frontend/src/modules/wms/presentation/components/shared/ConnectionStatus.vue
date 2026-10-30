<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { productApi } from '@/modules/master_data/infrastructure/product.api'
import { useOfflineSync } from '../../../application/useOfflineSync'

const isOnline = ref(true)
const isBackendReachable = ref(true)
const lastCheck = ref(new Date())
const { pendingCount, isSyncing, syncPendingScans } = useOfflineSync()

let intervalId: any = null

const checkConnection = async () => {
  isOnline.value = navigator.onLine

  if (isOnline.value) {
    try {
      await productApi.getProducts({ limit: 1 })
      isBackendReachable.value = true
    } catch (error: any) {
      if (error?.response && (error.response.status === 401 || error.response.status === 403)) {
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
    v-if="!isOnline || !isBackendReachable || pendingCount > 0"
    class="fixed bottom-4 right-4 z-[9999] bg-[hsl(var(--color-background))] shadow-xl border rounded-xl p-4 flex items-center gap-3"
    :class="[!isOnline || !isBackendReachable ? 'border-[hsl(var(--color-danger))] animate-pulse' : 'border-amber-500']"
  >
    <div
      class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
      :class="[
        !isOnline || !isBackendReachable
          ? 'bg-[hsl(var(--color-danger))/0.1] text-[hsl(var(--color-danger))]'
          : 'bg-amber-500/10 text-amber-500'
      ]"
    >
      <font-awesome-icon
        :icon="!isOnline || !isBackendReachable ? 'fa-solid fa-wifi' : 'fa-solid fa-cloud-arrow-down'"
        class="text-xl"
        :class="{ 'animate-spin': isSyncing }"
      />
    </div>

    <div>
      <h4
        class="font-bold text-sm"
        :class="!isOnline || !isBackendReachable ? 'text-[hsl(var(--color-danger))]' : 'text-amber-500'"
      >
        <span v-if="!isOnline || !isBackendReachable">Koneksi Terputus</span>
        <span v-else>Buffer Offline Aktif</span>
      </h4>
      <p class="text-xs opacity-70">
        <span v-if="!isOnline">Mode lorong offline. {{ pendingCount }} scan disimpan lokal.</span>
        <span v-else-if="!isBackendReachable">Server tidak merespon. {{ pendingCount }} scan disimpan lokal.</span>
        <span v-else>{{ pendingCount }} antrean scan siap disinkronkan.</span>
      </p>
    </div>

    <div v-if="isOnline && isBackendReachable && pendingCount > 0" class="ml-2">
      <button
        @click="syncPendingScans"
        :disabled="isSyncing"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-all disabled:opacity-50"
      >
        {{ isSyncing ? 'Syncing...' : 'Sync' }}
      </button>
    </div>
  </div>
</template>
