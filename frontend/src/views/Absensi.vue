<!-- views/Absensi.vue -->
<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth' // Import Pinia auth store
import Tabs from '@/components/Tabs.vue'
import FilterBar from '@/components/FilterBar.vue'
import SummaryView from '@/components/SummaryView.vue'
import DetailView from '@/components/DetailView.vue'
import Modal from '@/components/Modal.vue'
import UploadForm from '@/components/UploadForm.vue'
import Multiselect from 'vue-multiselect'
import 'vue-multiselect/dist/vue-multiselect.css'
import { useToast } from '@/composables/UseToast.js'

// Import semua fungsi helper dari satu tempat
import { getAbsensiData, getAvailableIndexes, uploadAbsensiFile } from '@/api/helpers/attendance.js'

// --- STATE ---
const authStore = useAuthStore() // Gunakan Pinia store
const { show } = useToast()
const isUploadModalOpen = ref(false)
const isUploading = ref(false)
const activeTab = ref('summary')
const summary = ref(null)
const users = ref([])
const availableIndexes = ref({})
const filters = ref([])
const filterValues = ref({
  year: '',
  month: '',
  name: [],
})

// --- WATCHERS & LIFECYCLE ---
watch(
  () => ({ year: filterValues.value.year, month: filterValues.value.month }),
  async ({ year, month }) => {
    if (!year || !month) return
    try {
      const data = await getAbsensiData(year, month)
      summary.value = data.summary || null
      users.value = data.users || []
    } catch (err) {
      show('Gagal memuat data absensi.', 'error')
      console.error('Fetch absensi error:', err)
      users.value = []
      summary.value = null
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    const indexes = await getAvailableIndexes()
    availableIndexes.value = indexes

    const years = Object.keys(indexes).sort((a, b) => b - a)
    if (years.length === 0) return

    const latestYear = years[0]
    const months = [...indexes[latestYear]].sort((a, b) => a - b)
    const latestMonth = months[months.length - 1]

    filterValues.value = {
      year: latestYear,
      month: latestMonth,
      name: [],
    }

    filters.value = [
      {
        type: 'select',
        key: 'year',
        label: 'Tahun',
        multiple: false,
        options: years.map((y) => ({ label: y, value: y })),
      },
      {
        type: 'select',
        key: 'month',
        label: 'Bulan',
        multiple: false,
        options: months.map((m) => ({
          label: new Date(2000, parseInt(m) - 1).toLocaleString('id-ID', { month: 'long' }),
          value: m,
        })),
      },
    ]
  } catch (err) {
    show('Gagal memuat index data.', 'error')
    console.error('Gagal fetch list_index.json:', err)
  }
})

// METHODS
function clearFilters() {
  const years = Object.keys(availableIndexes.value).sort((a, b) => b - a)
  if (years.length === 0) return

  const latestYear = years[0]
  const months = [...availableIndexes.value[latestYear]].sort((a, b) => a - b)
  const latestMonth = months[months.length - 1]

  // Mengatur ulang nilai filter, yang akan memicu 'watch' untuk mengambil data.
  filterValues.value = {
    year: latestYear,
    month: latestMonth,
    name: [], // Filter nama juga di-reset
  }
}

// --- UPLOAD ---
async function handleUpload(formData) {
  isUploading.value = true
  show('Mengupload file...', 'info')

  try {
    // ✅ PERBAIKAN: Gunakan helper, bukan axios langsung.
    const response = await uploadAbsensiFile(formData)

    if (response.success) {
      show('Upload berhasil! Data akan dimuat ulang.', 'success')
      isUploadModalOpen.value = false

      const { year, month } = response.processed
      if (year && month) {
        filterValues.value.year = year.toString()
        filterValues.value.month = String(month).padStart(2, '0')
      }
      const newIndexes = await getAvailableIndexes()
      availableIndexes.value = newIndexes
    } else {
      throw new Error(response.message || 'Terjadi kesalahan di server.')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message || 'Gagal mengupload file.'
    show(errorMessage, 'error')
    console.error('Upload error:', error)
  } finally {
    isUploading.value = false
  }
}
</script>
<template>
  <div class="bg-secondary/20">
    <header
      class="bg-background/80 backdrop-blur-sm sticky top-[65px] z-30 py-3 px-6 flex items-center gap-4 border-b border-secondary/20"
    >
      <Tabs
        :tabs="[
          { label: 'Ringkasan', value: 'summary' },
          { label: 'Detail Log', value: 'detail' },
        ]"
        v-model="activeTab"
      />
      <!-- ✅ SEKARANG BERFUNGSI: @clear sekarang terhubung ke fungsi clearFilters -->
      <FilterBar :filters="filters" v-model="filterValues" @clear="clearFilters" />
      <Multiselect
        v-model="filterValues.name"
        :options="users.map((u) => ({ label: u.nama, value: u.id }))"
        :multiple="true"
        label="label"
        track-by="value"
        placeholder="Pilih satu atau beberapa nama..."
        class="w-1/2"
      />
      <button
        @click="isUploadModalOpen = true"
        class="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
      >
        <font-awesome-icon icon="fa-solid fa-file-import" />
        <span>Import Data</span>
      </button>
    </header>

    <main class="p-6">
      <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
        <div v-if="activeTab === 'summary'">
          <SummaryView
            v-if="users.length > 0"
            :users="users"
            :year="parseInt(filterValues.year)"
            :month="parseInt(filterValues.month)"
            :global-info="summary"
          />
          <p v-else class="text-center text-text/60 py-10">
            Pilih tahun dan bulan untuk menampilkan data.
          </p>
        </div>

        <div v-else>
          <DetailView
            v-if="users.length > 0"
            :user="
              filterValues.name.length === 1
                ? users.find((u) => u.id === filterValues.name[0].value)
                : null
            "
            :users="
              filterValues.name.length > 1
                ? users.filter((u) => filterValues.name.map((n) => n.value).includes(u.id))
                : filterValues.name.length === 0
                  ? users
                  : null
            "
            :year="parseInt(filterValues.year)"
            :month="parseInt(filterValues.month)"
          />
          <p v-else class="text-center text-text/60 py-10">Belum ada log detail.</p>
        </div>
      </div>
    </main>

    <Modal :show="isUploadModalOpen" @close="isUploadModalOpen = false" title="Upload File Absensi">
      <UploadForm @submit="handleUpload" :loading="isUploading" />
      <template #footer>
        <button
          @click="isUploadModalOpen = false"
          class="bg-background border border-secondary/30 text-text/80 hover:bg-secondary/20 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Batal
        </button>
      </template>
    </Modal>
  </div>
</template>
