<!-- frontend\src\views\WMSPickingListView.vue -->
<script setup>
import { ref, computed, nextTick } from 'vue'
import PickingTaskTab from '@/components/picking/PickingTaskTab.vue'
import PickingHistoryTab from '@/components/picking/PickingHistoryTab.vue'
import PickingUploadTab from '@/components/picking/PickingUploadTab.vue'
import JobErrorModal from '@/components/picking/JobErrorModal.vue'

// --- STATE ---
const activeTab = ref('pickingList')
const API_BASE_URL = 'http://localhost:3000'

// --- REFS KE CHILD COMPONENTS ---
// Kita butuh ini untuk memanggil fungsi refresh/fetch di dalam child
const taskTabRef = ref(null)
const historyTabRef = ref(null)

// --- MODAL LOGIC ---
const showJobErrorModal = ref(false)
const selectedJob = ref(null)

function handleViewErrors(job) {
  selectedJob.value = job
  showJobErrorModal.value = true
}

// --- REFRESH LOGIC ---
// Dipanggil saat tombol refresh di header diklik
function refreshActiveTab() {
  if (activeTab.value === 'pickingList' && taskTabRef.value) {
    taskTabRef.value.fetchPendingItems()
  } else if (activeTab.value === 'history' && historyTabRef.value) {
    historyTabRef.value.fetchHistoryItems()
  }
  // Note: Tab Upload melakukan auto-polling, jadi tidak wajib di-refresh manual
}

// Fungsi Navigasi Tab Otomatis
async function handleSwitchTab(targetTab) {
  activeTab.value = targetTab

  // Tunggu DOM update agar ref 'taskTabRef' tersedia (karena v-if)
  await nextTick()

  if (targetTab === 'pickingList' && taskTabRef.value) {
    taskTabRef.value.fetchPendingItems() // Refresh daftar tugas
  }
}

// --- COMPUTED ---
// Mengambil jumlah item pending dari child component untuk badge di tab
const pendingCount = computed(() => taskTabRef.value?.pendingCount || 0)
console.group('WMSPickingListView State')
console.log('Pending Count:', pendingCount.value)
console.log('Active Tab:', activeTab.value)
console.log('Task Tab Ref:', taskTabRef.value)
console.log('Task Tab Ref Length:', taskTabRef.length)
console.log('History Tab Ref:', historyTabRef.value)
console.log('Show Job Error Modal:', showJobErrorModal.value)
console.log('Selected Job:', selectedJob.value)
console.groupEnd()
</script>

<template>
  <div class="p-4 md:p-8 min-h-screen bg-background text-text transition-colors duration-300">
    <!-- Header Section -->
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
      <div>
        <h1 class="text-3xl font-black tracking-tight text-text">
          Picking <span class="text-primary">Gudang</span>
        </h1>
        <p class="text-text/60 text-sm mt-1">
          Kelola tugas pengambilan barang dan laporan penjualan.
        </p>
      </div>
      <button @click="refreshActiveTab"
        class="h-10 w-10 rounded-full bg-secondary/20 hover:bg-primary hover:text-secondary border border-secondary/30 flex items-center justify-center transition-all duration-300 group"
        title="Refresh Data">
        <font-awesome-icon icon="fa-solid fa-rotate" class="group-hover:rotate-180 transition-transform duration-500" />
      </button>
    </header>

    <!-- Tabs Navigation -->
    <div class="bg-secondary/50 p-1.5 rounded-xl flex w-full md:w-auto mb-4 border border-secondary/20">
      <button v-for="tab in [
        {
          id: 'pickingList',
          label: 'Daftar Tugas',
          icon: 'fa-boxes-packing',
          count: pendingCount,
        },
        { id: 'history', label: 'Riwayat Picking', icon: 'fa-clock-rotate-left' },
        { id: 'upload', label: 'Unggah Laporan', icon: 'fa-cloud-upload-alt' },
      ]" :key="tab.id" @click="activeTab = tab.id"
        class="flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
        :class="activeTab === tab.id
            ? 'bg-primary text-secondary shadow-lg scale-[1.02]'
            : 'text-text/60 hover:text-text hover:bg-secondary/20'
          ">
        <font-awesome-icon :icon="`fa-solid ${tab.icon}`" />
        {{ tab.label }}
        <span v-if="tab.count"
          class="bg-secondary text-accent text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 shadow-sm">{{ tab.count
          }}</span>
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="min-h-[400px]">
      <!-- Menggunakan v-if memastikan komponen di-mount ulang saat tab berubah (penting untuk lifecycle hook) -->

      <!-- Tab 1: Picking List -->
      <PickingTaskTab v-if="activeTab === 'pickingList'" ref="taskTabRef" />

      <!-- Tab 2: History -->
      <PickingHistoryTab v-if="activeTab === 'history'" ref="historyTabRef" />

      <!-- Tab 3: Upload (Emit event saat tombol error diklik) -->
      <PickingUploadTab v-if="activeTab === 'upload'" @view-errors="handleViewErrors" @switch-tab="handleSwitchTab" />
    </div>

    <!-- Shared Error Modal -->
    <JobErrorModal :show="showJobErrorModal" :job="selectedJob" :api-base-url="API_BASE_URL"
      @close="showJobErrorModal = false" />
  </div>
</template>
