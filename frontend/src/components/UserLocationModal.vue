<script setup>
import { ref, watch } from 'vue'
import Modal from '@/components/Modal.vue'
import { fetchAllLocations } from '@/api/helpers/stock.js'
import { fetchUserLocationIds, updateUserLocations } from '@/api/helpers/admin.js'
import { useToast } from '@/composables/UseToast.js'

const props = defineProps({
  show: Boolean,
  user: Object,
})

const emit = defineEmits(['close', 'updated'])
const { show: showToast } = useToast()

const allLocations = ref([])
const selectedLocationIds = ref([])
const isLoading = ref(false)

watch(
  () => props.user,
  async (newUser) => {
    if (newUser) {
      isLoading.value = true
      try {
        // Ambil semua data yang dibutuhkan secara paralel untuk efisiensi
        const [allLocs, userLocIds] = await Promise.all([
          fetchAllLocations(),
          fetchUserLocationIds(newUser.id),
        ])
        allLocations.value = allLocs
        selectedLocationIds.value = userLocIds
      } catch (error) {
        // Menggunakan showToast yang sudah diganti namanya
        showToast('Gagal memuat data izin lokasi.', 'error')
      } finally {
        isLoading.value = false
      }
    }
  },
)

// Fungsi ini dipanggil saat tombol "Simpan" diklik.
async function handleSave() {
  if (!props.user) return
  isLoading.value = true
  try {
    await updateUserLocations(props.user.id, selectedLocationIds.value)
    showToast('Izin lokasi berhasil diperbarui.', 'success')
    emit('updated') // Beri tahu komponen induk bahwa data telah berubah
    emit('close')
  } catch (error) {
    showToast(error.message || 'Gagal menyimpan izin.', 'error')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Modal :show="show" @close="emit('close')" :title="`Atur Izin Lokasi untuk ${user?.username}`">
    <div v-if="isLoading" class="text-center p-8">
      <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-xl" />
      <p class="mt-2 text-sm text-text/70">Memuat data...</p>
    </div>
    <div v-else class="space-y-4 max-h-[60vh] overflow-y-auto">
      <p class="text-sm text-text/80">
        Pilih lokasi gudang yang dapat diakses oleh pengguna ini untuk melakukan transfer stok.
      </p>

      <!-- Daftar Lokasi dengan Checkbox -->
      <div class="grid grid-cols-3 md:grid-cols-4 gap-4">
        <div
          v-for="location in allLocations"
          :key="location.id"
          class="flex items-center p-2 rounded-md hover:bg-secondary/10"
        >
          <input
            type="checkbox"
            :id="`loc-${location.id}`"
            :value="location.id"
            v-model="selectedLocationIds"
            class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label
            :for="`loc-${location.id}`"
            class="ml-2 block text-sm text-text font-mono cursor-pointer"
            >{{ location.code }}</label
          >
        </div>
      </div>
    </div>

    <template #footer>
      <button
        @click="emit('close')"
        class="px-4 py-2 bg-secondary/20 text-text/80 rounded-lg hover:bg-secondary/30 transition"
      >
        Batal
      </button>
      <button
        @click="handleSave"
        :disabled="isLoading"
        class="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
      >
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
        <span>{{ isLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}</span>
      </button>
    </template>
  </Modal>
</template>
