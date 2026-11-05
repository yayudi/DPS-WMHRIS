  <script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import { useSlotting } from '@/modules/wms/application/useSlotting'
import { useToast } from '@/core/presentation/composables/useToast'
import { formatDate } from '@/core/utils/time'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  product: {
    type: Object,
    default: null
  },
  locations: {
    type: Array,
    default: () => []
  },
  initialLocationId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])
const { toast } = useToast()

const activeTab = ref('config') // 'config' | 'history'
const selectedLocationId = ref(null)

const {
  slots,
  logs,
  form,
  loading,
  loadingLogs,
  submitting,
  previewCoordinate,
  isFormValid,
  resetForm,
  fetchSlots,
  fetchLogs,
  addSlot,
  removeSlot,
  setPrimary
} = useSlotting()

// Filter atau susun opsi lokasi (Dukung loc.location_id dari stock_locations & loc.id dari master locations)
const availableLocations = computed(() => {
  const result = []
  const seenIds = new Set()

  // 1. Prioritaskan lokasi yang memiliki stok produk ini
  const productLocs = props.product?.stock_locations || []
  for (const loc of productLocs) {
    const locId = Number(loc.location_id || loc.id)
    if (locId && !seenIds.has(locId)) {
      seenIds.add(locId)
      result.push({
        id: locId,
        code: loc.location_code || loc.code || `Loc #${locId}`,
        quantity: loc.quantity ?? 0,
        purpose: loc.purpose || 'WAREHOUSE'
      })
    }
  }

  // 2. Sertakan juga master locations lain jika belum ada dalam list
  const masterLocs = props.locations || []
  for (const loc of masterLocs) {
    const locId = Number(loc.id || loc.location_id)
    if (locId && !seenIds.has(locId)) {
      seenIds.add(locId)
      result.push({
        id: locId,
        code: loc.code || loc.location_code || `Loc #${locId}`,
        quantity: 0,
        purpose: loc.purpose || 'WAREHOUSE'
      })
    }
  }

  return result
})

// Auto select lokasi pertama saat modal dibuka atau saat product berubah
watch(
  [() => props.show, () => props.product, () => props.initialLocationId],
  ([isOpen, product, initialLocId]) => {
    if (isOpen && product) {
      activeTab.value = 'config'
      if (initialLocId) {
        selectedLocationId.value = Number(initialLocId)
      } else if (availableLocations.value.length > 0) {
        selectedLocationId.value = Number(availableLocations.value[0].id)
      } else {
        selectedLocationId.value = null
      }
      loadDataForSelectedLocation()
    } else if (!isOpen) {
      resetForm()
      selectedLocationId.value = null
    }
  },
  { immediate: true }
)

watch(selectedLocationId, newLocId => {
  if (props.show && props.product && newLocId) {
    loadDataForSelectedLocation()
  }
})

async function loadDataForSelectedLocation() {
  if (!props.product?.id || !selectedLocationId.value) return
  await Promise.all([
    fetchSlots(Number(props.product.id), Number(selectedLocationId.value)),
    fetchLogs(Number(props.product.id), Number(selectedLocationId.value), 1)
  ])
}

async function handleAddSlot() {
  if (!props.product?.id) {
    toast('Data produk tidak ditemukan', 'warning')
    return
  }
  if (!selectedLocationId.value) {
    toast('Pilih lokasi terlebih dahulu', 'warning')
    return
  }
  if (!form.room.trim() || !form.rack.trim()) {
    toast('Ruang dan Rak wajib diisi', 'warning')
    return
  }
  const success = await addSlot(Number(props.product.id), Number(selectedLocationId.value))
  if (success) {
    emit('saved', {
      productId: Number(props.product.id),
      locationId: Number(selectedLocationId.value)
    })
  }
}

async function handleDeleteSlot(slotId) {
  if (!props.product?.id || !selectedLocationId.value) return
  const success = await removeSlot(Number(props.product.id), Number(selectedLocationId.value), Number(slotId))
  if (success) {
    emit('saved', {
      productId: Number(props.product.id),
      locationId: Number(selectedLocationId.value)
    })
  }
}

async function handleSetPrimary(slotId) {
  if (!props.product?.id || !selectedLocationId.value) return
  const success = await setPrimary(Number(props.product.id), Number(selectedLocationId.value), Number(slotId))
  if (success) {
    emit('saved', {
      productId: Number(props.product.id),
      locationId: Number(selectedLocationId.value)
    })
  }
}

function handleTabChange(tab) {
  activeTab.value = tab
  if (tab === 'history' && props.product?.id && selectedLocationId.value) {
    fetchLogs(props.product.id, selectedLocationId.value, 1)
  }
}

function getActionBadge(action) {
  switch (action) {
    case 'INITIAL_ASSIGN':
      return { label: 'Penempatan Awal', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
    case 'ADDED':
      return { label: 'Tambah Rak', bg: 'bg-teal-500/10 text-teal-400 border-teal-500/20' }
    case 'MOVED':
      return { label: 'Pindah/Ubah Utama', bg: 'bg-sky-500/10 text-sky-400 border-sky-500/20' }
    case 'REMOVED':
      return { label: 'Hapus Rak', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20' }
    case 'CLEARED':
      return { label: 'Dikosongkan', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20' }
    default:
      return { label: action, bg: 'bg-secondary/20 text-text/70 border-secondary/40' }
  }
}
</script>

<template>
  <BaseModal :show="show" @close="emit('close')" max-width="max-w-2xl" title="Atur Ambalan / Multi-Rak (Slotting)">
    <div v-if="product" class="space-y-4">
      <!-- Product Header Bar -->
      <div class="flex items-start justify-between gap-4 p-3 bg-secondary/10 rounded-xl border border-secondary/20">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold border border-primary/20">
              {{ product.sku }}
            </span>
            <span v-if="product.category_name" class="text-xs text-text/50">
              {{ product.category_name }}
            </span>
          </div>
          <h4 class="font-bold text-text text-base leading-snug truncate" :title="product.name">
            {{ product.name }}
          </h4>
        </div>

        <!-- Location Dropdown Selector -->
        <div class="shrink-0 text-right">
          <label class="block text-[11px] font-semibold text-text/60 uppercase tracking-wider mb-1">
            Pilih Lokasi
          </label>
          <select
            v-model.number="selectedLocationId"
            class="px-3 py-1.5 bg-background border border-secondary/40 rounded-lg text-xs font-mono font-medium text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option v-if="availableLocations.length === 0" :value="null" disabled>
              Pilih Lokasi...
            </option>
            <option v-for="loc in availableLocations" :key="loc.id" :value="loc.id">
              {{ loc.code }} (Stok: {{ loc.quantity ?? 0 }})
            </option>
          </select>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-b border-secondary/20 gap-2">
        <button
          type="button"
          @click="handleTabChange('config')"
          class="pb-2.5 px-3 text-sm font-semibold transition-all relative flex items-center gap-2"
          :class="activeTab === 'config' ? 'text-primary border-b-2 border-primary' : 'text-text/60 hover:text-text'"
        >
          <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
          <span>Daftar Rak ({{ slots.length }})</span>
        </button>

        <button
          type="button"
          @click="handleTabChange('history')"
          class="pb-2.5 px-3 text-sm font-semibold transition-all relative flex items-center gap-2"
          :class="activeTab === 'history' ? 'text-primary border-b-2 border-primary' : 'text-text/60 hover:text-text'"
        >
          <font-awesome-icon icon="fa-solid fa-clock-rotate-left" />
          <span>Riwayat Perpindahan</span>
          <span
            v-if="logs.length > 0"
            class="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-secondary/30 text-text/70 font-mono"
          >
            {{ logs.length }}
          </span>
        </button>
      </div>

      <!-- TAB 1: DAFTAR RAK & FORM TAMBAH -->
      <div v-if="activeTab === 'config'" class="space-y-4">
        <!-- Active Racks List -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-text/70">
            <span>Rak Terdaftar di Lokasi Ini:</span>
            <span class="text-[11px] text-text/50 font-normal">Prioritas picking mengikuti Rak Utama</span>
          </div>

          <div v-if="loading" class="p-4 text-center text-xs text-text/50 italic bg-secondary/5 rounded-xl border border-secondary/15">
            Memuat daftar ambalan/rak...
          </div>

          <div v-else-if="slots.length === 0" class="p-4 text-center text-xs text-text/50 italic bg-secondary/5 rounded-xl border border-secondary/15">
            Belum ada ambalan/rak terdaftar untuk produk ini di lokasi terpilih.
          </div>

          <div v-else class="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
            <div
              v-for="s in slots"
              :key="s.id"
              class="p-2.5 rounded-xl border flex items-center justify-between transition-colors"
              :class="s.is_primary ? 'bg-primary/5 border-primary/30' : 'bg-secondary/10 border-secondary/20'"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <div
                  class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs"
                  :class="s.is_primary ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-text/50'"
                >
                  <font-awesome-icon :icon="s.is_primary ? 'fa-solid fa-star' : 'fa-solid fa-layer-group'" />
                </div>
                <div class="truncate">
                  <div class="font-mono font-bold text-xs text-text flex items-center gap-2">
                    <span>{{ s.formatted_coordinate }}</span>
                    <span
                      class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border"
                      :class="s.is_primary ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-secondary/30 text-text/60 border-secondary/40'"
                    >
                      {{ s.is_primary ? 'Utama' : 'Buffer / Cadangan' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Actions per slot -->
              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="!s.is_primary"
                  type="button"
                  @click="handleSetPrimary(s.id)"
                  class="px-2 py-1 text-[11px] rounded bg-secondary/20 hover:bg-primary/10 text-text/70 hover:text-primary transition-colors flex items-center gap-1 font-medium"
                  title="Jadikan sebagai rak pengambilan utama"
                >
                  <font-awesome-icon icon="fa-solid fa-star" class="text-[10px]" />
                  <span>Jadikan Utama</span>
                </button>

                <button
                  type="button"
                  @click="handleDeleteSlot(s.id)"
                  class="w-7 h-7 rounded hover:bg-rose-500/10 text-text/40 hover:text-rose-400 transition-colors flex items-center justify-center text-xs"
                  title="Hapus rak ini"
                >
                  <font-awesome-icon icon="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Rack Form Card -->
        <div class="p-3.5 bg-secondary/10 rounded-xl border border-secondary/25 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <font-awesome-icon icon="fa-solid fa-plus" class="text-primary text-[10px]" />
              <span>Tambah Rak Baru</span>
            </span>
            <!-- Live Preview -->
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-mono font-bold text-[11px]">
              <font-awesome-icon icon="fa-solid fa-layer-group" class="text-[10px]" />
              <span>{{ previewCoordinate }}</span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <!-- Ruang -->
            <div>
              <label class="block text-[11px] font-semibold text-text/80 mb-1">
                Ruang <span class="text-rose-500">*</span>
              </label>
              <input
                v-model="form.room"
                type="text"
                placeholder="Misal: R.UTAMA"
                @keydown.enter="handleAddSlot"
                class="w-full px-2.5 py-1.5 bg-background border border-secondary/40 rounded-lg text-xs text-text font-mono uppercase focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <!-- Rak -->
            <div>
              <label class="block text-[11px] font-semibold text-text/80 mb-1">
                Rak <span class="text-rose-500">*</span>
              </label>
              <input
                v-model="form.rack"
                type="text"
                placeholder="Misal: B-02"
                @keydown.enter="handleAddSlot"
                class="w-full px-2.5 py-1.5 bg-background border border-secondary/40 rounded-lg text-xs text-text font-mono uppercase focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <!-- Tingkat / Ambalan -->
            <div>
              <label class="block text-[11px] font-semibold text-text/80 mb-1">
                Tingkat <span class="text-text/40 text-[10px]">(Opsional)</span>
              </label>
              <input
                v-model="form.tier"
                type="text"
                placeholder="Misal: T3"
                @keydown.enter="handleAddSlot"
                class="w-full px-2.5 py-1.5 bg-background border border-secondary/40 rounded-lg text-xs text-text font-mono uppercase focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <!-- Notes & Primary Checkbox -->
          <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
            <input
              v-model="form.notes"
              type="text"
              placeholder="Catatan penambahan rak (opsional)..."
              @keydown.enter="handleAddSlot"
              class="w-full px-2.5 py-1.5 bg-background border border-secondary/40 rounded-lg text-xs text-text focus:outline-none focus:border-primary transition-colors"
            />

            <label class="flex items-center gap-2 cursor-pointer text-xs text-text/80 font-medium select-none">
              <input
                v-model="form.is_primary"
                type="checkbox"
                class="rounded border-secondary/40 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
              />
              <span>Jadikan Rak Utama</span>
            </label>
          </div>

          <div class="flex justify-end pt-1">
            <button
              type="button"
              @click="handleAddSlot"
              :disabled="submitting"
              class="px-3.5 py-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-secondary rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow"
            >
              <font-awesome-icon v-if="submitting" icon="fa-solid fa-spinner" spin />
              <span>{{ submitting ? 'Menyimpan...' : '+ Tambahkan Rak' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- TAB 2: RIWAYAT PERPINDAHAN LOGS -->
      <div v-else-if="activeTab === 'history'" class="space-y-3 min-h-[200px]">
        <div v-if="loadingLogs" class="py-12 text-center text-text/50 space-y-2">
          <font-awesome-icon icon="fa-solid fa-spinner" spin class="text-2xl text-primary" />
          <p class="text-xs">Memuat riwayat perpindahan...</p>
        </div>

        <div v-else-if="logs.length === 0" class="py-12 text-center text-text/50 space-y-2">
          <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-3xl text-secondary/40" />
          <p class="text-xs">Belum ada riwayat perpindahan ambalan/rak untuk lokasi ini.</p>
        </div>

        <div v-else class="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
          <div
            v-for="log in logs"
            :key="log.id"
            class="p-3 bg-secondary/10 rounded-xl border border-secondary/20 hover:border-secondary/40 transition-colors space-y-2"
          >
            <!-- Log Header: Badge & Date -->
            <div class="flex items-center justify-between text-xs">
              <span
                class="px-2 py-0.5 rounded text-[11px] font-bold border"
                :class="getActionBadge(log.action).bg"
              >
                {{ getActionBadge(log.action).label }}
              </span>
              <span class="text-[11px] text-text/50 font-mono">
                {{ formatDate(log.created_at, true, true) }}
              </span>
            </div>

            <!-- Coordinate Transition -->
            <div class="flex items-center gap-2 text-xs font-mono">
              <span
                v-if="log.from_coordinate"
                class="px-2 py-0.5 rounded bg-secondary/20 text-text/70 line-through"
              >
                {{ log.from_coordinate }}
              </span>
              <span v-else class="text-text/40 italic text-[11px]">(Belum ada rak)</span>

              <font-awesome-icon icon="fa-solid fa-arrow-right" class="text-[10px] text-text/40" />

              <span
                v-if="log.to_coordinate"
                class="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold border border-primary/20"
              >
                {{ log.to_coordinate }}
              </span>
              <span v-else class="text-rose-400 italic text-[11px]">(Dihapus/Dikosongkan)</span>
            </div>

            <!-- Operator & Notes -->
            <div class="flex items-center justify-between text-[11px] text-text/50 pt-1 border-t border-secondary/10">
              <span class="flex items-center gap-1.5">
                <font-awesome-icon icon="fa-solid fa-user" class="text-[10px]" />
                <span>{{ log.user_name || `User #${log.user_id || 'System'}` }}</span>
              </span>
              <span v-if="log.notes" class="italic truncate max-w-[280px]" :title="log.notes">
                "{{ log.notes }}"
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Footer -->
    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-2 bg-secondary/20 hover:bg-secondary/30 text-text/80 rounded-lg text-sm font-medium transition-colors"
        >
          Selesai
        </button>
      </div>
    </template>
  </BaseModal>
</template>
