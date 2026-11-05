<script setup lang="ts">
import { useOfflineSync } from '../../../application/useOfflineSync'

const {
  isOnline,
  isSyncing,
  pendingCount,
  syncError,
  syncPendingScans
} = useOfflineSync()

const handleManualSync = async () => {
  await syncPendingScans()
}
</script>

<template>
  <div
    v-if="pendingCount > 0 || !isOnline"
    class="w-full mb-4 px-4 py-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-sm transition-all"
    :class="[
      !isOnline
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 dark:text-amber-400'
        : 'bg-primary-500/10 border-primary-500/30 text-primary-500 dark:text-primary-400'
    ]"
  >
    <div class="flex items-center gap-3">
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        :class="!isOnline ? 'bg-amber-500/20' : 'bg-primary-500/20'"
      >
        <font-awesome-icon
          :icon="!isOnline ? 'fa-solid fa-cloud-arrow-down' : 'fa-solid fa-arrows-rotate'"
          :class="{ 'animate-spin': isSyncing }"
        />
      </div>

      <div>
        <div class="font-semibold flex items-center gap-2">
          <span>{{ !isOnline ? 'Mode Lorong Gudang (Offline Buffer)' : 'Sinkronisasi Buffer WMS' }}</span>
          <span
            v-if="pendingCount > 0"
            class="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-500"
          >
            {{ pendingCount }} antrean
          </span>
        </div>
        <p class="text-xs opacity-80 mt-0.5">
          <span v-if="!isOnline">
            Koneksi terputus. Scan barcode picking tersimpan aman di IndexedDB perangkat ini.
          </span>
          <span v-else-if="isSyncing">
            Sedang mengunggah data picking buffer ke server...
          </span>
          <span v-else-if="pendingCount > 0">
            Koneksi kembali online. Data offline siap disinkronkan ke server.
          </span>
          <span v-else>
            Semua data fisik picking telah sinkron dengan server.
          </span>
        </p>
        <p v-if="syncError" class="text-xs text-red-500 mt-1 font-medium">
          {{ syncError }}
        </p>
      </div>
    </div>

    <div v-if="isOnline && pendingCount > 0" class="shrink-0">
      <button
        @click="handleManualSync"
        :disabled="isSyncing"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
      >
        <font-awesome-icon icon="fa-solid fa-rotate" :class="{ 'animate-spin': isSyncing }" />
        <span>{{ isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang' }}</span>
      </button>
    </div>
  </div>
</template>
