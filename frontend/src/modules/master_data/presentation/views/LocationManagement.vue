<script setup lang="ts">
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import SearchInput from '@/core/presentation/components/ui/SearchInput.vue'
import { ref, onMounted, computed, watch } from 'vue'
import { useFirebaseSync } from '@/core/presentation/composables/useFirebaseSync'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/core/presentation/composables/useToast'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseSkeleton from '@/core/presentation/components/ui/BaseSkeleton.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import TriStateSelect from '@/core/presentation/components/ui/TriStateSelect.vue'
import { useMobile } from '@/core/presentation/composables/useMobile'
import { usePagination } from '@/core/presentation/composables/usePagination'
import BaseContextMenu from '@/core/presentation/components/ui/BaseContextMenu.vue'
import { useContextMenu } from '@/core/presentation/composables/useContextMenu'
import { useInstantInlineEdit } from '@/core/presentation/composables/useInstantInlineEdit'
import { getLocationBuildingColorClass, getLocationPurposeColorClass } from '@/core/utils/formatters'
import { useLocations } from '../../application/useLocations'
import type { Location, CreateLocationPayload, UpdateLocationPayload } from '../../domain/location.entity'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { isMobile } = useMobile()
const { toast } = useToast()
const { t } = useI18n()

const {
  locations: allLocations,
  isLoading: loading,
  fetchLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  toggleFulfillmentSource
} = useLocations()

function isDisallowedFulfillmentPurpose(purpose?: string): boolean {
  if (!purpose) return false
  return ['BAD_STOCK', 'WORKSHOP', 'BRANCH'].includes(purpose.toUpperCase())
}

async function handleToggleFulfillment(loc: Location) {
  if (isDisallowedFulfillmentPurpose(loc.purpose)) {
    toast(t('master_data.location.fulfillment_disallowed_warning', { purpose: loc.purpose }), 'warning')
    return
  }
  const nextVal = !loc.is_fulfillment_source
  await toggleFulfillmentSource(loc.id, nextVal)
}

const purposeOptions = computed(() => {
  const defaults = ['WAREHOUSE', 'DISPLAY', 'BRANCH', 'RECEIVING', 'WORKSHOP', 'TRANSIT']
  const fromData = allLocations.value.map(l => l.purpose).filter(Boolean)
  return [...new Set([...defaults, ...fromData])]
})
const searchQuery = ref('')
const selectedBuilding = ref({ include: [] as string[], exclude: [] as string[] })
const selectedPurpose = ref({ include: [] as string[], exclude: [] as string[] })
const filterFulfillment = ref<'all' | 'active' | 'inactive'>('all')

const fulfillmentOptions = computed(() => [
  { value: 'all', label: t('common.filter.all') },
  { value: 'active', label: t('common.status.active') },
  { value: 'inactive', label: t('common.status.inactive') }
])

const buildingOptions = computed(() => {
  const buildings = allLocations.value.map(l => l.building).filter(Boolean)
  return [...new Set(buildings)].sort()
})

const filteredLocations = computed(() => {
  const result = allLocations.value.filter(loc => {
    // 1. Search filter
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      const matchCode = loc.code?.toLowerCase().includes(q)
      const matchBuilding = loc.building?.toLowerCase().includes(q)
      const matchName = (loc.name || '').toLowerCase().includes(q)
      if (!matchCode && !matchBuilding && !matchName) return false
    }

    // 2. Purpose filter
    if (selectedPurpose.value.include.length > 0 && !selectedPurpose.value.include.includes(loc.purpose)) return false
    if (selectedPurpose.value.exclude.length > 0 && selectedPurpose.value.exclude.includes(loc.purpose)) return false

    // 3. Building filter
    if (selectedBuilding.value.include.length > 0 && !selectedBuilding.value.include.includes(loc.building))
      return false
    if (selectedBuilding.value.exclude.length > 0 && selectedBuilding.value.exclude.includes(loc.building)) return false

    // 4. Fulfillment source filter
    if (filterFulfillment.value === 'active' && !loc.is_fulfillment_source) return false
    if (filterFulfillment.value === 'inactive' && loc.is_fulfillment_source) return false

    return true
  })

  // Urutkan berdasarkan ID menurun agar lokasi yang baru dibuat tampil di atas
  return result.sort((a, b) => (b.id || 0) - (a.id || 0))
})

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

const selectedLocation = ref<any>({
  id: null,
  code: '',
  building: '',
  floor: null,
  name: '',
  purpose: 'WAREHOUSE',
  is_active: true,
  is_fulfillment_source: false
})

async function loadLocations(silent = false) {
  // Silent is mostly handled internally or just call fetchLocations
  await fetchLocations()
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
    is_active: true,
    is_fulfillment_source: false
  }
  isModalOpen.value = true
}

function openEditModal(location: Location) {
  isEditing.value = true
  selectedLocation.value = { ...location }
  isModalOpen.value = true
}

async function handleSave() {
  try {
    if (isEditing.value) {
      const success = await updateLocation(selectedLocation.value.id, selectedLocation.value)
      if (success) isModalOpen.value = false
    } else {
      const success = await createLocation(selectedLocation.value)
      if (success) isModalOpen.value = false
    }
  } catch (error) {
    console.error(error)
  }
}

// --- INLINE EDIT HANDLERS ---
const { contextMenu, openContextMenu } = useContextMenu()
const { handleCellBlur, handleDropdownChange } = useInstantInlineEdit(
  async (id: number, payload: any) => {
    await updateLocation(id, payload)
  },
  (item: any) => ({ ...item, floor: item.floor ? Number(item.floor) : null }) // send full location object with floor as number
)

function handleContextAction(action: string) {
  if (action === 'delete') {
    handleDelete(contextMenu.value.row.id)
  } else if (action === 'edit') {
    openEditModal(contextMenu.value.row)
  }
}

async function handleDelete(locationId: number) {
  if (await swalConfirm(t('master_data.location.confirm_delete'))) {
    await deleteLocation(locationId)
  }
}

watch(
  [searchQuery, selectedBuilding, selectedPurpose, filterFulfillment],
  () => {
    changePage(1)
  },
  { deep: true }
)

// --- LOCAL HOTKEYS ---
const { Alt_N, Alt_S, Slash } = useMagicKeys()

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

watch(Slash, pressed => {
  if (pressed && !isModalOpen.value) {
    setTimeout(() => {
      const el = document.getElementById('global-search-input')
      if (el) el.focus()
    }, 10)
  }
})
</script>

<template>
  <div class="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center justify-between gap-3 w-full mb-4">
    <div class="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
      <div class="w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs min-w-0">
        <SearchInput
          v-model="searchQuery"
          input-id="global-search-input"
          :placeholder="t('master_data.location.search_placeholder')"
        />
      </div>

      <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full sm:w-auto shrink-0">
        <div class="w-full sm:w-auto sm:max-w-[190px] shrink-0">
          <TriStateSelect
            v-model="selectedBuilding"
            :options="buildingOptions"
            :placeholder="t('common.filter.all_buildings')"
            :label-prefix="t('common.label.building')"
            :searchable="true"
          />
        </div>

        <div class="w-full sm:w-auto sm:max-w-[190px] shrink-0">
          <TriStateSelect
            v-model="selectedPurpose"
            :options="purposeOptions"
            :placeholder="t('common.filter.all_purposes')"
            :label-prefix="t('common.label.purpose')"
            :searchable="true"
          />
        </div>

        <div class="w-full sm:w-auto sm:max-w-[230px] shrink-0">
          <BaseSelect
            v-model="filterFulfillment"
            :options="fulfillmentOptions"
            class="w-full h-[42px]"
            :class="[filterFulfillment !== 'all' ? 'ring-1 ring-primary/50 rounded-lg' : '']"
            :placeholder="t('master_data.location.fulfillment_source')"
            :label-prefix="t('master_data.location.fulfillment_source')"
            prefer-placeholder
            label="label"
            track-by="value"
            :searchable="false"
            emit-value
          />
        </div>
      </div>
    </div>

    <button
      @click="openCreateModal"
      class="bg-primary text-secondary text-sm font-semibold px-4 h-[42px] rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-md shadow-primary/20 shrink-0 whitespace-nowrap sm:ml-auto"
    >
      <font-awesome-icon icon="fa-solid fa-plus" />
      <span>{{ t('master_data.location.add_btn') }}</span>
    </button>
  </div>

  <div class="flex flex-col gap-4">

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
              {{ t('master_data.location.code') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10">{{ t('common.label.building') }}</th>
            <th class="px-6 py-3 border-b border-secondary/10">{{ t('common.label.floor') }}</th>
            <th class="px-6 py-3 border-b border-secondary/10">{{ t('master_data.location.name') }}</th>
            <th class="px-6 py-3 border-b border-secondary/10">{{ t('common.label.purpose') }}</th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center">
              {{ t('master_data.location.fulfillment_source') }}
            </th>
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
              <td class="px-6 py-4"><BaseSkeleton shape="rect" className="w-10 h-5 mx-auto rounded-full" /></td>
            </tr>
          </template>

          <tr v-else-if="allLocations.length === 0" key="empty">
            <td colspan="6" class="py-12 text-center text-text/50 italic">{{ t('master_data.location.empty') }}</td>
          </tr>

          <tr v-else-if="filteredLocations.length === 0" key="not-found">
            <td colspan="6" class="py-12 text-center text-text/50 italic">
              {{ t('master_data.location.not_found') }}
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
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-sans">{{
                t('master_data.location.code')
              }}</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[30px]"
                @blur="handleCellBlur($event, loc, 'code')"
                @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                >{{ loc.code }}</span
              >
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{
                t('common.label.building')
              }}</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary inline-flex items-center px-2 py-1 -mx-2 rounded min-w-[30px] font-medium ring-1 ring-inset"
                :class="getLocationBuildingColorClass(loc.building)"
                @blur="handleCellBlur($event, loc, 'building')"
                @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                >{{ loc.building }}</span
              >
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{
                t('common.label.floor')
              }}</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[30px]"
                @blur="handleCellBlur($event, loc, 'floor')"
                @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                >{{ loc.floor ?? '' }}</span
              >
            </td>
            <td
              class="text-text/80"
              :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{
                t('master_data.location.name')
              }}</span>
              <span
                contenteditable="true"
                class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[30px]"
                @blur="handleCellBlur($event, loc, 'name')"
                @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                >{{ loc.name }}</span
              >
            </td>
            <td
              class="font-mono text-xs"
              :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-sans font-semibold">{{
                t('common.label.purpose')
              }}</span>
              <span
                class="inline-flex items-center px-2 py-1 -mx-2 rounded font-medium ring-1 ring-inset"
                :class="getLocationPurposeColorClass(loc.purpose)"
              >
                <select
                  class="bg-transparent outline-none cursor-pointer appearance-none pr-4"
                  :value="loc.purpose"
                  @change="handleDropdownChange(loc, 'purpose', ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="opt in purposeOptions" :key="opt" :value="opt" class="bg-background text-text">
                    {{ opt }}
                  </option>
                </select>
              </span>
            </td>
            <td
              class="text-center"
              :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-sans font-semibold">{{
                t('master_data.location.fulfillment_source')
              }}</span>
              <div class="inline-flex items-center gap-1.5 justify-center">
                <button
                  type="button"
                  :disabled="isDisallowedFulfillmentPurpose(loc.purpose)"
                  @click="handleToggleFulfillment(loc)"
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  :class="loc.is_fulfillment_source ? 'bg-primary' : 'bg-secondary/30'"
                  :title="
                    isDisallowedFulfillmentPurpose(loc.purpose)
                      ? t('master_data.location.fulfillment_disallowed_tooltip')
                      : loc.is_fulfillment_source
                        ? t('master_data.location.fulfillment_active_tooltip')
                        : t('master_data.location.fulfillment_inactive_tooltip')
                  "
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out"
                    :class="loc.is_fulfillment_source ? 'translate-x-4' : 'translate-x-0'"
                  />
                </button>
                <span v-if="loc.is_fulfillment_source" class="text-[11px] font-semibold text-primary uppercase ml-0.5">
                  {{ t('common.status.active') }}
                </span>
              </div>
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
      { label: t('master_data.location.context_edit'), action: 'edit', icon: 'fa-solid fa-pen-to-square' },
      { label: t('master_data.location.context_delete'), action: 'delete', icon: 'fa-solid fa-trash', danger: true }
    ]"
    @close="contextMenu.visible = false"
    @action="handleContextAction"
  />

  <!-- Modal untuk Tambah/Edit Lokasi -->
  <Teleport to="body">
    <BaseModal
      :show="isModalOpen"
      @close="isModalOpen = false"
      :title="isEditing ? t('master_data.location.modal_edit_title') : t('master_data.location.modal_add_title')"
    >
      <form @submit.prevent="handleSave" class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">{{
            t('analytics.capacity.col_location_code')
          }}</label>
          <input
            v-model="selectedLocation.code"
            type="text"
            required
            class="w-full input-field"
            placeholder="e.g., A19-1"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">{{ t('common.label.building') }}</label>
          <input
            v-model="selectedLocation.building"
            type="text"
            required
            list="building-datalist"
            class="w-full input-field"
            :placeholder="t('master_data.location.building_placeholder')"
            autocomplete="off"
          />
          <datalist id="building-datalist">
            <option v-for="b in buildingOptions" :key="b" :value="b" />
          </datalist>
          <p class="text-[11px] text-text/40 mt-1">{{ t('master_data.location.building_hint') }}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">{{ t('common.label.purpose') }}</label>
          <input
            v-model="selectedLocation.purpose"
            type="text"
            required
            list="purpose-datalist"
            class="w-full input-field"
            :placeholder="t('master_data.location.purpose_placeholder')"
            autocomplete="off"
          />
          <datalist id="purpose-datalist">
            <option v-for="p in purposeOptions" :key="p" :value="p" />
          </datalist>
          <p class="text-[11px] text-text/40 mt-1">{{ t('master_data.location.purpose_hint') }}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">{{ t('common.label.floor') }}</label>
          <input
            v-model.number="selectedLocation.floor"
            type="number"
            class="w-full input-field"
            placeholder="e.g., 1"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">{{ t('master_data.location.name_label') }}</label>
          <input
            v-model="selectedLocation.name"
            type="text"
            class="w-full input-field"
            placeholder="e.g., Gudang A19 Lantai 1"
          />
        </div>
        <div class="flex items-center gap-2 pt-2 border-t border-secondary/20">
          <input
            id="is_fulfillment_source"
            v-model="selectedLocation.is_fulfillment_source"
            type="checkbox"
            :disabled="isDisallowedFulfillmentPurpose(selectedLocation.purpose)"
            class="rounded border-secondary/50 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
          />
          <label for="is_fulfillment_source" class="text-sm font-medium text-text/80 select-none cursor-pointer">
            {{ t('master_data.location.fulfillment_checkbox_label') }}
          </label>
        </div>
      </form>
      <template #footer>
        <button type="button" @click="isModalOpen = false" class="btn-secondary">{{ t('common.btn.cancel') }}</button>
        <button type="submit" @click="handleSave" class="btn-primary">{{ t('common.btn.save') }}</button>
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
