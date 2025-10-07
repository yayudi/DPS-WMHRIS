<!-- views/Absensi.vue -->
<script setup>
import { ref, watch, onMounted } from 'vue'
import Tabs from '@/components/Tabs.vue'
import FilterBar from '@/components/FilterBar.vue'
import { getAbsensiData } from '@/api/helpers/attendance.js'
import SummaryView from '@/components/SummaryView.vue'
import DetailView from '@/components/DetailView.vue'
import 'vue-multiselect/dist/vue-multiselect.css'
import Modal from '@/components/Modal.vue'
import UploadForm from '@/components/UploadForm.vue'
import Multiselect from 'vue-multiselect'
import { useToast } from '@/composables/UseToast.js'

// --- STATE ---
const { show } = useToast()
const isUploadModalOpen = ref(false)
const isUploading = ref(false)
const activeTab = ref('summary')
const summary = ref(null)
const users = ref([])
const logs = ref([])
const filteredUsers = ref([])
const availableIndexes = ref({})
const selectedUserIndex = ref(-1)
const filters = ref([])
const filterValues = ref({
  year: '',
  month: '',
  name: [],
})

function clearFilters() {
  const years = Object.keys(availableIndexes.value).sort((a, b) => b - a)
  const latestYear = years[0]
  const months = availableIndexes.value[latestYear].sort()
  const latestMonth = months[months.length - 1]

  filterValues.value = { year: [latestYear], month: [latestMonth], name: [] }
  selectedUserIndex.value = -1
  logs.value = users.value.flatMap((u) => u.logs || [])
}

watch(
  () => ({ year: filterValues.value.year, month: filterValues.value.month }),
  async ({ year, month }) => {
    if (!year || !month) return
    try {
      const data = await getAbsensiData(year, month)

      summary.value = data.summary || null
      users.value = data.users || []

      if (users.value.length > 0) {
        selectedUserIndex.value = -1
        logs.value = users.value.flatMap((u) => u.logs || [])
      } else {
        logs.value = []
      }
    } catch (err) {
      console.error('Fetch absensi error:', err)
      users.value = []
      logs.value = []
      summary.value = null
    }
  },
  { immediate: true },
)

function applyFilter(values) {
  let filtered = users.value

  if (Array.isArray(values.name) && values.name.length) {
    const selectedIds = values.name.map((n) => n.value)
    filtered = filtered.filter((u) => selectedIds.includes(u.id))
  }

  filteredUsers.value = filtered
  logs.value = filtered.flatMap((u) => u.logs || [])
}

// --- UPLOAD ---
async function handleUpload(formData) {
  isUploading.value = true
  show('Mengupload file...', 'info')

  try {
    const response = await axios.post(`${API_URL}attendance/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        // ✅ PERUBAHAN 2: Sertakan token autentikasi!
        // Diasumsikan Anda menyimpannya di Pinia store atau localStorage
        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
      },
    })

    if (response.data.success) {
      show('Upload berhasil! Data akan dimuat ulang.', 'success')
      isUploadModalOpen.value = false

      const { year, month } = response.data.processed

      if (year && month) {
        // Perbarui filter, ini akan otomatis memicu 'watch' untuk mengambil data baru
        filterValues.value.year = year.toString()
        // Pastikan format bulan adalah 2 digit (misal: '09')
        filterValues.value.month = String(month).padStart(2, '0')
      } else {
        // Fallback jika backend tidak memberi info (seharusnya tidak terjadi)
        await fetchAbsensiForCurrentFilter()
      }
    } else {
      // Menangani error yang dikirim dari server (success: false)
      throw new Error(response.data.message || 'Terjadi kesalahan di server.')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message || 'Gagal mengupload file.'
    show(errorMessage, 'error')
    console.error('Upload error:', error)
  } finally {
    isUploading.value = false
  }
}

async function fetchAbsensiForCurrentFilter() {
  const { year, month } = filterValues.value
  if (!year || !month) return
  try {
    const data = await getAbsensiData(year, month)
    summary.value = data.summary || null
    users.value = data.users || []
    // Terapkan filter nama setelah data baru diterima
    applyFilter(filterValues.value)
  } catch (err) {
    console.error('Fetch absensi error:', err)
    show('Gagal memuat data absensi.', 'error')
    users.value = []
    logs.value = []
    summary.value = null
  }
}

onMounted(async () => {
  try {
    const res = await fetch(JSON_URL + 'absensi/list_index.json')
    availableIndexes.value = await res.json()

    const years = Object.keys(availableIndexes.value).sort((a, b) => b - a)
    const latestYear = years[0]
    const months = availableIndexes.value[latestYear].sort()
    const latestMonth = months[months.length - 1]

    filterValues.value = {
      year: latestYear,
      month: latestMonth,
      name: [],
    }

    filters.value = [
      { type: 'text', key: 'name', label: 'Nama', placeholder: 'Cari nama...' },
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
    console.error('Gagal fetch list_index.json:', err)
  }
})
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
      <FilterBar
        :filters="filters"
        v-model="filterValues"
        @change="applyFilter"
        @clear="clearFilters"
      />
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
      <!-- Konten utama sekarang dibungkus card -->
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
                ? filteredUsers
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

    <!-- MODAL -->
    <Modal :show="isUploadModalOpen" @close="isUploadModalOpen = false" title="Upload File Absensi">
      <!-- Masukkan UploadForm ke dalam slot default modal -->
      <UploadForm @submit="handleUpload" :loading="isUploading" />

      <!-- Contoh penggunaan slot footer -->
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
