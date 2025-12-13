<!-- frontend\src\views\admin\LocationManagement.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from '@/composables/useToast.js'
import {
  fetchAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/api/helpers/locations.js'
import Modal from '@/components/ui/Modal.vue'

const { show } = useToast()

const purposeOptions = ref(['WAREHOUSE', 'DISPLAY', 'BRANCH', 'RECEIVING', 'WORKSHOP', 'TRANSIT'])

const allLocations = ref([])
const loading = ref(true)
const isModalOpen = ref(false)
const isEditing = ref(false)
const selectedLocation = ref({
  id: null,
  code: '',
  building: '',
  floor: null,
  name: '',
  purpose: 'WAREHOUSE',
})

async function loadLocations() {
  loading.value = true
  try {
    allLocations.value = await fetchAllLocations()
  } catch (error) {
    show('Gagal memuat data lokasi.', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadLocations)

function openCreateModal() {
  isEditing.value = false
  selectedLocation.value = {
    id: null,
    code: '',
    building: '',
    floor: null,
    name: '',
    purpose: 'WAREHOUSE', // Tambahkan purpose
  }
  isModalOpen.value = true
}

function openEditModal(location) {
  isEditing.value = true
  // Salin data agar tidak mengubah data asli secara langsung
  selectedLocation.value = { ...location }
  isModalOpen.value = true
}

async function handleSave() {
  try {
    if (isEditing.value) {
      await updateLocation(selectedLocation.value.id, selectedLocation.value)
      show('Lokasi berhasil diperbarui.', 'success')
    } else {
      await createLocation(selectedLocation.value)
      show('Lokasi berhasil dibuat.', 'success')
    }
    isModalOpen.value = false
    loadLocations() // Muat ulang data
  } catch (error) {
    show(error.message || 'Gagal menyimpan data.', 'error')
  }
}

async function handleDelete(locationId) {
  if (
    confirm(
      'Apakah Anda yakin ingin menghapus lokasi ini? Menghapus lokasi yang sedang digunakan akan gagal.',
    )
  ) {
    try {
      await deleteLocation(locationId)
      show('Lokasi berhasil dihapus.', 'success')
      loadLocations() // Muat ulang data
    } catch (error) {
      show(error.message || 'Gagal menghapus lokasi.', 'error')
    }
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-text">Manajemen Lokasi</h2>
      <button
        @click="openCreateModal"
        class="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
      >
        <font-awesome-icon icon="fa-solid fa-plus" />
        <span>Tambah Lokasi</span>
      </button>
    </div>

    <div v-if="loading" class="text-center p-8">Memuat data...</div>
    <div
      v-else
      class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto"
    >
      <table class="w-full text-sm text-left text-text">
        <thead class="text-xs text-text/80 uppercase bg-secondary/20">
          <tr>
            <th class="px-6 py-3">Kode</th>
            <th class="px-6 py-3">Gedung</th>
            <th class="px-6 py-3">Lantai</th>
            <th class="px-6 py-3">Nama/Deskripsi</th>
            <th class="px-6 py-3">Purpose</th>
            <th class="px-6 py-3 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="loc in allLocations"
            :key="loc.id"
            class="border-b border-secondary/20 hover:bg-primary/5"
          >
            <td class="px-6 py-4 font-mono font-semibold">{{ loc.code }}</td>
            <td class="px-6 py-4">{{ loc.building }}</td>
            <td class="px-6 py-4">{{ loc.floor || '-' }}</td>
            <td class="px-6 py-4 text-text/80">{{ loc.name || '-' }}</td>
            <td class="px-6 py-4 font-mono text-xs">{{ loc.purpose || '-' }}</td>
            <td class="px-6 py-4 text-center space-x-4">
              <button
                @click="openEditModal(loc)"
                class="text-primary hover:underline text-xs font-semibold"
              >
                Edit
              </button>
              <button
                @click="handleDelete(loc.id)"
                class="text-accent hover:underline text-xs font-semibold"
              >
                Hapus
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal untuk Tambah/Edit Lokasi -->
  <Modal
    :show="isModalOpen"
    @close="isModalOpen = false"
    :title="isEditing ? 'Edit Lokasi' : 'Tambah Lokasi Baru'"
  >
    <form @submit.prevent="handleSave" class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Kode Lokasi</label>
        <input
          v-model="selectedLocation.code"
          type="text"
          required
          class="w-full input-field"
          placeholder="e.g., A19-1"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Gedung</label>
        <input
          v-model="selectedLocation.building"
          type="text"
          required
          class="w-full input-field"
          placeholder="e.g., A19"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Purpose</label>
        <select v-model="selectedLocation.purpose" required class="w-full input-field">
          <option v-for="opt in purposeOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Lantai (Opsional)</label>
        <input
          v-model.number="selectedLocation.floor"
          type="number"
          class="w-full input-field"
          placeholder="e.g., 1"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Nama/Deskripsi (Opsional)</label>
        <input
          v-model="selectedLocation.name"
          type="text"
          class="w-full input-field"
          placeholder="e.g., Gudang A19 Lantai 1"
        />
      </div>
    </form>
    <template #footer>
      <button type="button" @click="isModalOpen = false" class="btn-secondary">Batal</button>
      <button type="submit" @click="handleSave" class="btn-primary">Simpan</button>
    </template>
  </Modal>
</template>

<style lang="postcss" scoped>
.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary;
}
.btn-primary {
  @apply bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50;
}
.btn-secondary {
  @apply bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20;
}
</style>
