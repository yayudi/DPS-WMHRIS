<!-- frontend\src\views\admin\LocationManagement.vue -->
<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import WmsActionHeader from '@/components/wms/shared/WmsActionHeader.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useFirebaseSync } from '@/composables/useFirebaseSync'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/composables/useToast.js'
import { createLocation, updateLocation, deleteLocation } from '@/api/helpers/locations.js'
import { useMasterDataStore } from '@/stores/masterData'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useMobile } from '@/composables/useMobile.js'
import { usePagination } from '@/composables/usePagination.js'
import BaseContextMenu from '@/components/ui/BaseContextMenu.vue'
import { useContextMenu } from '@/composables/useContextMenu.js'
import { useInstantInlineEdit } from '@/composables/useInstantInlineEdit.js'
import { getLocationBuildingColorClass, getLocationPurposeColorClass } from '@/utils/formatters.js'

const { isMobile } = useMobile()

const masterData = useMasterDataStore()

const { toast } = useToast()

const allLocations = ref([])

const purposeOptions = computed(() => {
  const defaults = ['WAREHOUSE', 'DISPLAY', 'BRANCH', 'RECEIVING', 'WORKSHOP', 'TRANSIT']
  const fromData = allLocations.value.map(l => l.purpose).filter(Boolean)
  return [...new Set([...defaults, ...fromData])]
})
const searchQuery = ref('')
const selectedPurpose = ref('all')
const selectedBuilding = ref('all')

const buildingOptions = computed(() => {
  const buildings = allLocations.value.map(l => l.building).filter(Boolean)
  return [...new Set(buildings)].sort()
})

const filteredLocations = computed(() => {
  const result = allLocations.value.filter(loc => {
    // 1. Search filter
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      const matchCode = loc.code.toLowerCase().includes(q)
      const matchBuilding = loc.building.toLowerCase().includes(q)
      const matchName = (loc.name || '').toLowerCase().includes(q)
      if (!matchCode && !matchBuilding && !matchName) return false
    }

    // 2. Purpose filter
    if (selectedPurpose.value !== 'all' && loc.purpose !== selectedPurpose.value) {
      return false
    }

    // 3. Building filter
    if (selectedBuilding.value !== 'all' && loc.building !== selectedBuilding.value) {
      return false
    }

    return true
  })

  // Urutkan berdasarkan ID menurun agar lokasi yang baru dibuat tampil di atas
  return result.sort((a, b) => (b.id || 0) - (a.id || 0))
})

const loading = ref(true)
const isModalOpen = ref(false)
const isEditing = ref(false)

const {
  paginatedData: visibleLocations,
  meta: pagination,
  changePage,
  changePageSize
} = usePagination({
  totalItems: filteredLocations,
  storageKey: 'locationPageSize',
  initialLimit: 10
})

const selectedLocation = ref({
  id: null,
  code: '',
  building: '',
  floor: null,
  name: '',
  purpose: 'WAREHOUSE',
  is_active: true
})

async function loadLocations(silent = false) {
  if (!silent) loading.value = true
  try {
    allLocations.value = await masterData.getLocations(true)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLocations()
})

useFirebaseSync('MASTER_DATA', 'REFRESH_LOCATIONS', () => loadLocations(true))

function openCreateModal() {
  isEditing.value = false
  selectedLocation.value = {
    id: null,
    code: '',
    building: '',
    floor: null,
    name: '',
    purpose: 'WAREHOUSE',
    is_active: true
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
      toast('Lokasi berhasil diperbarui.', 'success')
    } else {
      await createLocation(selectedLocation.value)
      toast('Lokasi berhasil dibuat.', 'success')
    }
    isModalOpen.value = false
    loadLocations() // Muat ulang data
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  }
}

// --- INLINE EDIT HANDLERS ---
const { contextMenu, openContextMenu } = useContextMenu()
const { handleCellBlur, handleDropdownChange } = useInstantInlineEdit(
  async (id, payload) => {
    await updateLocation(id, payload)
  },
  item => ({ ...item, floor: item.floor ? Number(item.floor) : null }) // send full location object with floor as number
)

function handleContextAction(action) {
  if (action === 'delete') {
    handleDelete(contextMenu.value.row.id)
  } else if (action === 'edit') {
    openEditModal(contextMenu.value.row)
  }
}

async function handleDelete(locationId) {
  if (
    await swalConfirm(
      'Apakah Anda yakin ingin menghapus lokasi ini? Menghapus lokasi yang sedang digunakan akan gagal.'
    )
  ) {
    try {
      await deleteLocation(locationId)
      toast('Lokasi berhasil dihapus.', 'success')
      loadLocations() // Muat ulang data
    } catch (error) {
      console.error(error)
    }
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_N, Alt_S } = useMagicKeys()

watch(Alt_N, pressed => {
  if (pressed && !isModalOpen.value) {
    openCreateModal()
  }
})

watch(Alt_S, pressed => {
  if (pressed && isModalOpen.value) {
    handleSave()
  }
})
</script>

<template>
  <WmsActionHeader title="Manajemen Lokasi" icon="fa-solid fa-map-marker-alt">
    <template #actions>
      <button
        @click="openCreateModal"
        class="bg-primary text-secondary text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
      >
        <font-awesome-icon icon="fa-solid fa-plus" />
        <span>Tambah Lokasi</span>
      </button>
    </template>
  </WmsActionHeader>

  <div class="flex flex-col gap-4">
    <!-- Filter Bar -->
    <div
      class="flex flex-col md:flex-row gap-4 items-center justify-between bg-background p-4 rounded-xl shadow-sm border border-secondary/20"
    >
      <div class="w-full md:w-96 relative group">
        <font-awesome-icon
          icon="fa-solid fa-search"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 group-focus-within:text-primary transition-colors"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari kode, gedung, atau nama lokasi..."
          class="w-full pl-10 pr-4 py-2.5 bg-secondary/5 border border-secondary/20 focus:border-primary focus:bg-background rounded-lg text-sm transition-all focus:ring-4 focus:ring-primary/10 outline-none placeholder:text-text/40"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-text/30 hover:text-danger transition-colors p-1"
        >
          <font-awesome-icon icon="fa-solid fa-xmark" />
        </button>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
        <select
          v-model="selectedBuilding"
          class="bg-secondary/5 border border-secondary/20 text-text/80 text-sm rounded-lg focus:ring-primary focus:border-primary block w-full px-3 py-2.5 outline-none transition-colors"
        >
          <option value="all">Semua Gedung</option>
          <option v-for="b in buildingOptions" :key="b" :value="b">{{ b }}</option>
        </select>

        <select
          v-model="selectedPurpose"
          class="bg-secondary/5 border border-secondary/20 text-text/80 text-sm rounded-lg focus:ring-primary focus:border-primary block w-full px-3 py-2.5 outline-none transition-colors"
        >
          <option value="all">Semua Purpose</option>
          <option v-for="p in purposeOptions" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
    </div>

    <div
      class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-220px)] table-container"
    >
      <table class="w-full text-sm text-left text-text border-collapse" :class="isMobile ? 'block' : 'min-w-[600px]'">
        <thead
          class="bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5"
          :class="isMobile ? 'hidden' : 'sticky top-0 z-30'"
        >
          <tr class="text-xs text-text/80 uppercase">
            <th
              class="px-6 py-3 sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
            >
              Kode
            </th>
            <th class="px-6 py-3 border-b border-secondary/10">Gedung</th>
            <th class="px-6 py-3 border-b border-secondary/10">Lantai</th>
            <th class="px-6 py-3 border-b border-secondary/10">Nama/Deskripsi</th>
            <th class="px-6 py-3 border-b border-secondary/10">Purpose</th>
          </tr>
        </thead>
        <TransitionGroup
          tag="tbody"
          name="list"
          class="relative"
          :class="isMobile ? 'block' : 'divide-y divide-secondary/5'"
        >
          <template v-if="loading">
            <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
              <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-12 h-4 mx-auto" /></td>
              <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-1/2 h-4" /></td>
              <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-1/4 h-4" /></td>
              <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-3/4 h-4" /></td>
              <td class="px-6 py-4"><BaseSkeleton shape="rect" className="w-16 h-6 rounded-md" /></td>
            </tr>
          </template>

          <tr v-else-if="allLocations.length === 0" key="empty">
            <td colspan="5" class="py-12 text-center text-text/50 italic">Tidak ada data lokasi yang tersedia.</td>
          </tr>

          <tr v-else-if="filteredLocations.length === 0" key="not-found">
            <td colspan="5" class="py-12 text-center text-text/50 italic">
              Tidak ada lokasi yang cocok dengan filter.
            </td>
          </tr>

          <tr
            v-else
            v-for="loc in visibleLocations"
            :key="loc.id"
            class="transition-colors group relative"
            :class="
              isMobile
                ? 'block mb-4 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                : 'border-b border-secondary/20 hover:bg-secondary/5'
            "
            @contextmenu.prevent.stop="openContextMenu($event, loc)"
          >
            <td
              class="font-mono font-semibold bg-background group-hover:bg-secondary/5 transition-colors"
              :class="
                isMobile
                  ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                  : 'px-6 py-4 sticky left-0 z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-sans">Kode</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[30px]"
                @blur="handleCellBlur($event, loc, 'code')"
                @keydown.enter.prevent="$event.target.blur()"
                >{{ loc.code }}</span
              >
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Gedung</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary inline-flex items-center px-2 py-1 -mx-2 rounded min-w-[30px] font-medium ring-1 ring-inset"
                :class="getLocationBuildingColorClass(loc.building)"
                @blur="handleCellBlur($event, loc, 'building')"
                @keydown.enter.prevent="$event.target.blur()"
                >{{ loc.building }}</span
              >
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Lantai</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[30px]"
                @blur="handleCellBlur($event, loc, 'floor')"
                @keydown.enter.prevent="$event.target.blur()"
                >{{ loc.floor ?? '' }}</span
              >
            </td>
            <td
              class="text-text/80"
              :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Nama</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[30px]"
                @blur="handleCellBlur($event, loc, 'name')"
                @keydown.enter.prevent="$event.target.blur()"
                >{{ loc.name }}</span
              >
            </td>
            <td
              class="font-mono text-xs"
              :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-sans font-semibold">Purpose</span>
              <span
                class="inline-flex items-center px-2 py-1 -mx-2 rounded font-medium ring-1 ring-inset"
                :class="getLocationPurposeColorClass(loc.purpose)"
              >
                <select
                  class="bg-transparent outline-none cursor-pointer appearance-none pr-4"
                  :value="loc.purpose"
                  @change="handleDropdownChange(loc, 'purpose', $event.target.value)"
                >
                  <option v-for="opt in purposeOptions" :key="opt" :value="opt" class="bg-background text-text">
                    {{ opt }}
                  </option>
                </select>
              </span>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && filteredLocations.length > 0" class="rounded-xl overflow-hidden">
      <BasePagination
        :pagination="pagination"
        :show-limit-picker="true"
        @changePage="changePage"
        @update:limit="changePageSize"
        class="bg-transparent mb-0 pb-1"
      />
    </div>
  </div>

  <!-- CONTEXT MENU -->
  <BaseContextMenu
    :visible="contextMenu.visible"
    :x="contextMenu.x"
    :y="contextMenu.y"
    :options="[
      { label: 'Edit Lengkap', action: 'edit', icon: 'fa-solid fa-pen-to-square' },
      { label: 'Hapus Lokasi', action: 'delete', icon: 'fa-solid fa-trash', danger: true }
    ]"
    @close="contextMenu.visible = false"
    @action="handleContextAction"
  />

  <!-- Modal untuk Tambah/Edit Lokasi -->
  <Teleport to="body">
    <BaseModal
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
            list="building-datalist"
            class="w-full input-field"
            placeholder="Pilih atau ketik gedung baru..."
            autocomplete="off"
          />
          <datalist id="building-datalist">
            <option v-for="b in buildingOptions" :key="b" :value="b" />
          </datalist>
          <p class="text-[11px] text-text/40 mt-1">Pilih dari daftar, atau ketik nama gedung baru</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">Purpose</label>
          <input
            v-model="selectedLocation.purpose"
            type="text"
            required
            list="purpose-datalist"
            class="w-full input-field"
            placeholder="Pilih atau ketik purpose baru..."
            autocomplete="off"
          />
          <datalist id="purpose-datalist">
            <option v-for="p in purposeOptions" :key="p" :value="p" />
          </datalist>
          <p class="text-[11px] text-text/40 mt-1">Pilih dari daftar, atau ketik purpose baru</p>
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
    </BaseModal>
  </Teleport>
</template>

<style lang="postcss" scoped>
.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary;
}

.btn-primary {
  @apply bg-primary text-secondary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50;
}

.btn-secondary {
  @apply bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20;
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  transition: all 0.3s ease;
}
</style>
