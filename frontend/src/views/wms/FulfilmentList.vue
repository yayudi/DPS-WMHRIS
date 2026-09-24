<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { syncKeljaFulfillment } from '@/api/helpers/fulfilment.js'
import { useToast } from '@/composables/useToast.js'

const { toast } = useToast()
const route = useRoute()

const activeTab = computed(() => route.name)
const isSyncing = ref(false)

async function handleSync() {
  if (isSyncing.value) return
  isSyncing.value = true
  try {
    const res = await syncKeljaFulfillment()
    toast(res.message || 'Sinkronisasi berjalan di latar belakang.', 'success')
  } catch {
    toast('Gagal memulai sinkronisasi Kelja', 'error')
  } finally {
    isSyncing.value = false
  }
}

const showTabs = computed(() => {
  return route.name === 'WMSFulfilmentTasks' || route.name === 'WMSFulfilmentHistory'
})
</script>

<template>
  <div class="animate-fade-in text-text transition-colors duration-300">
    <!-- Tabs Navigation (Hanya tampil di daftar tugas & riwayat) -->
    <div v-if="showTabs" class="bg-secondary/50 p-1.5 rounded-xl flex w-full md:w-auto mb-4 border border-secondary/20">
      <router-link
        :to="{ name: 'WMSFulfilmentTasks' }"
        title="Menampilkan tugas yang aktif untuk diproses (Pick & Packing)"
        class="flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
        :class="
          activeTab === 'WMSFulfilmentTasks'
            ? 'bg-primary text-secondary shadow-lg'
            : 'text-text/60 hover:text-text hover:bg-secondary/20'
        "
      >
        <font-awesome-icon icon="fa-solid fa-boxes-packing" />
        Daftar Tugas
      </router-link>
      <router-link
        :to="{ name: 'WMSFulfilmentHistory' }"
        title="Menampilkan arsip pesanan (Selesai & Batal). Revisi lama dikelompokkan otomatis."
        class="flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
        :class="
          activeTab === 'WMSFulfilmentHistory'
            ? 'bg-primary text-secondary shadow-lg'
            : 'text-text/60 hover:text-text hover:bg-secondary/20'
        "
      >
        <font-awesome-icon icon="fa-solid fa-clock-rotate-left" />
        Riwayat Fulfilment
      </router-link>
      <button
        @click="handleSync"
        :disabled="isSyncing"
        class="bg-secondary/20 text-text border border-secondary/30 h-10 w-10 hover:text-primary flex items-center justify-center transition-all duration-300 group disabled:opacity-50 ml-1 rounded-md"
        title="Sync Data dari Kelja"
      >
        <font-awesome-icon
          :icon="isSyncing ? 'fa-solid fa-circle-notch' : 'fa-solid fa-rotate'"
          :class="isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'"
        />
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="min-h-[400px]">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
