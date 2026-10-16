<!-- frontend\src\views\WMSPickingListView.vue -->
<script setup>
import { ref, computed, nextTick } from 'vue'
import PickingTaskTab from '@/components/picking/PickingTaskTab.vue'
import PickingStockRequirementsTab from '@/components/picking/PickingStockRequirementsTab.vue'
import PickingHistoryTab from '@/components/picking/PickingHistoryTab.vue'
import PickingUploadTab from '@/components/picking/PickingUploadTab.vue'
import JobErrorModal from '@/components/picking/JobErrorModal.vue'

// --- STATE ---
const activeTab = ref('pickingList')
const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
const taskInitialSearch = ref('')

// --- REFS KE CHILD COMPONENTS ---
// Kita butuh ini untuk memanggil fungsi refresh/fetch di dalam child
const taskTabRef = ref(null)
const requirementsTabRef = ref(null)
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
  } else if (activeTab.value === 'requirements' && requirementsTabRef.value) {
    requirementsTabRef.value.refetchRequirements()
  } else if (activeTab.value === 'history' && historyTabRef.value) {
    historyTabRef.value.fetchHistoryItems()
  }
}

// Fungsi Navigasi Tab Otomatis
async function handleSwitchTab(targetTab) {
  activeTab.value = targetTab

  // Tunggu DOM update agar ref 'taskTabRef' / 'requirementsTabRef' tersedia (karena v-if)
  await nextTick()

  if (targetTab === 'pickingList' && taskTabRef.value) {
    taskTabRef.value.fetchPendingItems() // Refresh daftar tugas
  } else if (targetTab === 'requirements' && requirementsTabRef.value) {
    requirementsTabRef.value.refetchRequirements()
  }
}

/**
 * Navigasi langsung ke tab Daftar Tugas dengan filter pencarian terpasang
 * @param {string} query
 */
async function handleNavigateToTask(query) {
  taskInitialSearch.value = query || ''
  activeTab.value = 'pickingList'
  await nextTick()
  if (taskTabRef.value?.setSearchFilter) {
    taskTabRef.value.setSearchFilter(query)
  }
}

const pendingCount = computed(() => taskTabRef.value?.pendingCount || 0)
const deficitCount = computed(() => requirementsTabRef.value?.deficitCount || 0)
</script>

<template>
  <div class="animate-fade-in text-text transition-colors duration-300">
    <Teleport to="#header-actions"> </Teleport>

    <!-- Tabs Navigation -->
    <div class="bg-secondary/50 p-1.5 rounded-xl flex w-full md:w-auto mb-4 border border-secondary/20">
      <button
        v-for="tab in [
          {
            id: 'pickingList',
            label: 'Daftar Tugas',
            icon: 'fa-boxes-packing',
            count: pendingCount
          },
          {
            id: 'requirements',
            label: 'Kebutuhan Stok',
            icon: 'fa-cubes-stacked',
            count: deficitCount,
            badgeClass: deficitCount > 0 ? 'bg-danger text-white' : ''
          },
          { id: 'history', label: 'Riwayat Picking', icon: 'fa-clock-rotate-left' },
          { id: 'upload', label: 'Unggah Laporan', icon: 'fa-cloud-upload-alt' }
        ]"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
        :class="
          activeTab === tab.id
            ? 'bg-primary text-secondary shadow-lg'
            : 'text-text/60 hover:text-text hover:bg-secondary/20'
        "
      >
        <font-awesome-icon :icon="`fa-solid ${tab.icon}`" />
        {{ tab.label }}
        <span
          v-if="tab.count"
          class="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 shadow-sm"
          :class="tab.badgeClass || 'bg-secondary text-accent'"
          >{{ tab.count }}</span
        >
      </button>
      <button
        @click="refreshActiveTab"
        class="bg-secondary/20 text-text border border-secondary/30 h-10 w-10 hover:text-primary flex items-center justify-center transition-all duration-300 group"
        title="Refresh Data"
      >
        <font-awesome-icon icon="fa-solid fa-rotate" class="group-hover:rotate-180 transition-transform duration-500" />
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="min-h-[400px]">
      <!-- Menggunakan v-if memastikan komponen di-mount ulang saat tab berubah (penting untuk lifecycle hook) -->

      <!-- Tab 1: Picking List -->
      <PickingTaskTab
        v-if="activeTab === 'pickingList'"
        ref="taskTabRef"
        :initial-search="taskInitialSearch"
      />

      <!-- Tab 2: Kebutuhan Stok -->
      <PickingStockRequirementsTab
        v-if="activeTab === 'requirements'"
        ref="requirementsTabRef"
        @navigate-to-task="handleNavigateToTask"
      />

      <!-- Tab 3: History -->
      <PickingHistoryTab v-if="activeTab === 'history'" ref="historyTabRef" />

      <!-- Tab 4: Upload (Emit event saat tombol error diklik) -->
      <PickingUploadTab v-if="activeTab === 'upload'" @view-errors="handleViewErrors" @switch-tab="handleSwitchTab" />
    </div>

    <!-- Shared Error Modal -->
    <JobErrorModal
      :show="showJobErrorModal"
      :job="selectedJob"
      :api-base-url="baseUrl"
      @close="showJobErrorModal = false"
    />
  </div>
</template>
