<script setup lang="ts">
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { ref, computed, onMounted, watch } from 'vue'
import { useFirebaseSync } from '@/core/presentation/composables/useFirebaseSync'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/core/presentation/composables/useToast'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseSkeleton from '@/core/presentation/components/ui/BaseSkeleton.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import BaseSwitch from '@/core/presentation/components/ui/BaseSwitch.vue'
import SearchInput from '@/core/presentation/components/ui/SearchInput.vue'
import { useMobile } from '@/core/presentation/composables/useMobile'
import { usePagination } from '@/core/presentation/composables/usePagination'
import BaseContextMenu from '@/core/presentation/components/ui/BaseContextMenu.vue'
import { useContextMenu } from '@/core/presentation/composables/useContextMenu'
import { useInstantInlineEdit } from '@/core/presentation/composables/useInstantInlineEdit'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { useCategories } from '../../application/useCategories'
import type { Category } from '../../domain/category.entity'

const { isMobile } = useMobile()
const { toast } = useToast()
const { t } = useI18n()

const {
  categories,
  isLoading: loading,
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory
} = useCategories()

const saving = ref(false)
const isModalOpen = ref(false)
const isEditing = ref(false)
const searchQuery = ref('')
const filterStatus = ref<'active' | 'archived'>('active')
const filterUsage = ref<'all' | 'used' | 'empty'>('all')
const form = ref<{ id: number | null; name: string }>({ id: null, name: '' })

const usageOptions = computed(() => [
  { value: 'all', label: t('common.filter.all') },
  { value: 'used', label: t('master_data.category.usage_used') },
  { value: 'empty', label: t('master_data.category.usage_empty') }
])

const filteredCategories = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return categories.value.filter(cat => {
    if (query && !cat.name.toLowerCase().includes(query)) return false
    const count = cat.product_count ?? 0
    if (filterUsage.value === 'used') return count > 0
    if (filterUsage.value === 'empty') return count === 0
    return true
  })
})

const {
  currentPage,
  currentLimit,
  paginatedData: visibleCategories,
  meta: pagination,
  changePage,
  changePageSize
} = usePagination({
  totalItems: filteredCategories,
  storageKey: 'categoryPageSize',
  initialLimit: 20
})

watch([searchQuery, filterUsage], () => {
  changePage(1)
})

watch(filterStatus, () => {
  changePage(1)
  loadCategories()
})

async function loadCategories() {
  await fetchCategories('', filterStatus.value)
}

onMounted(() => loadCategories())
useFirebaseSync('MASTER_DATA', 'REFRESH_CATEGORIES', () => loadCategories())

function openCreateModal() {
  isEditing.value = false
  form.value = { id: null, name: '' }
  isModalOpen.value = true
}

function openEditModal(category: Category) {
  isEditing.value = true
  form.value = { id: category.id, name: category.name }
  isModalOpen.value = true
}

async function handleSave() {
  if (!form.value.name.trim()) {
    toast(t('master_data.category.empty_name_error'), 'error')
    return
  }

  saving.value = true
  try {
    if (isEditing.value && form.value.id) {
      await updateCategory(form.value.id, { name: form.value.name })
    } else {
      await createCategory({ name: form.value.name })
    }
    isModalOpen.value = false
  } catch (error) {
    console.error(error)
  } finally {
    saving.value = false
  }
}

async function handleDelete(categoryId: number) {
  if (!(await swalConfirm(t('master_data.category.confirm_deactivate')))) return

  try {
    await deleteCategory(categoryId)
  } catch (error) {
    console.error(error)
  }
}

async function handleRestore(category: Category) {
  const confirmed = await swalConfirm(
    t('master_data.catalog.confirm_restore', {
      entity: t('common.label.category').toLowerCase(),
      name: category.name
    })
  )
  if (!confirmed) return

  try {
    await restoreCategory(category.id)
  } catch (error) {
    console.error(error)
  }
}

const { contextMenu, openContextMenu } = useContextMenu()
const { handleCellBlur } = useInstantInlineEdit(
  async (id: number, payload: any) => {
    await updateCategory(id, payload)
  },
  (item: Category) => item // send full category object
)

const validateCategoryName = (val: string) => {
  if (!val) {
    toast(t('master_data.category.empty_name_error'), 'error')
    return false
  }
  return true
}

function handleContextAction(action: string) {
  if (action === 'delete') {
    handleDelete(contextMenu.value.row.id)
  } else if (action === 'edit') {
    openEditModal(contextMenu.value.row)
  } else if (action === 'restore') {
    handleRestore(contextMenu.value.row)
  }
}

const contextMenuOptions = computed(() => {
  if (filterStatus.value === 'archived') {
    return [{ label: t('master_data.category.context_restore'), action: 'restore', icon: 'fa-solid fa-rotate-left' }]
  }
  return [
    { label: t('master_data.location.context_edit'), action: 'edit', icon: 'fa-solid fa-pen-to-square' },
    { label: t('master_data.category.context_delete'), action: 'delete', icon: 'fa-solid fa-trash', danger: true }
  ]
})

// --- LOCAL HOTKEYS ---
const { Alt_N, Alt_S, Slash } = useMagicKeys()

watch(Alt_N, pressed => {
  if (pressed && !isModalOpen.value) openCreateModal()
})

watch(Alt_S, pressed => {
  if (pressed && isModalOpen.value && !saving.value) handleSave()
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
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto flex-1">
      <div class="w-full sm:max-w-xs">
        <SearchInput
          v-model="searchQuery"
          input-id="global-search-input"
          :placeholder="`${t('common.btn.search')} ${t('master_data.category.col_name')}...`"
        />
      </div>
      <div class="w-full sm:w-auto sm:max-w-[175px] shrink-0">
        <BaseSelect
          v-model="filterUsage"
          :options="usageOptions"
          class="w-full h-[42px]"
          :class="[filterUsage !== 'all' ? 'ring-1 ring-primary/50 rounded-lg' : '']"
          :placeholder="t('master_data.category.usage_filter')"
          :label-prefix="t('master_data.category.usage_filter')"
          prefer-placeholder
          label="label"
          track-by="value"
          :searchable="false"
          emit-value
        />
      </div>
      <BaseSwitch
        :model-value="filterStatus === 'archived'"
        @update:model-value="val => (filterStatus = val ? 'archived' : 'active')"
        :left-label="t('common.status.active')"
        :right-label="t('common.status.archived')"
        class="w-full sm:w-auto shrink-0"
      />
    </div>
    <button
      @click="openCreateModal"
      class="bg-primary text-secondary text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-md shadow-primary/20 shrink-0"
    >
      <font-awesome-icon icon="fa-solid fa-plus" />
      <span>{{ t('master_data.category.add_btn') }}</span>
    </button>
  </div>
  <div>
    <div
      class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(75vh-100px)] table-container"
    >
      <table class="w-full text-sm text-left text-text border-collapse" :class="isMobile ? 'block' : 'min-w-[400px]'">
        <thead
          class="bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5"
          :class="isMobile ? 'hidden' : 'sticky top-0 z-30'"
        >
          <tr class="text-xs text-text/80 uppercase">
            <th class="px-6 py-3 border-b border-secondary/10 w-16 text-center">#</th>
            <th class="px-6 py-3 border-b border-secondary/10">{{ t('master_data.category.col_name') }}</th>
            <th class="px-6 py-3 border-b border-secondary/10 w-32 text-right">
              {{ t('master_data.category.col_product_count') }}
            </th>
          </tr>
        </thead>
        <TransitionGroup
          tag="tbody"
          name="list"
          class="relative"
          :class="isMobile ? 'block' : 'divide-y divide-secondary/5'"
        >
          <!-- Loading State -->
          <template v-if="loading">
            <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
              <td class="px-6 py-4 text-center"><BaseSkeleton shape="rect" className="w-4 h-4 mx-auto" /></td>
              <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-1/2 h-4" /></td>
              <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-12 h-4 ml-auto" /></td>
            </tr>
          </template>

          <tr v-else-if="filteredCategories.length === 0" key="empty">
            <td colspan="3" class="py-12 text-center text-text/50 italic">
              <font-awesome-icon icon="fa-solid fa-tags" class="text-3xl text-text/20 mb-3 block" />
              {{
                searchQuery.trim() || filterStatus === 'archived' || filterUsage !== 'all'
                  ? t('common.empty.no_data')
                  : t('master_data.category.empty_desc')
              }}
            </td>
          </tr>

          <tr
            v-else
            v-for="(cat, index) in visibleCategories"
            :key="cat.id"
            class="transition-colors group relative"
            :class="
              isMobile
                ? 'block mb-3 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                : 'border-b border-secondary/20 hover:bg-secondary/5'
            "
            @contextmenu.prevent.stop="openContextMenu($event, cat)"
          >
            <td
              class="text-text/40 font-mono text-xs"
              :class="isMobile ? 'flex justify-between items-center py-2' : 'px-6 py-4 text-center'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-sans font-semibold">#</span>
              <span>{{ (currentPage - 1) * currentLimit + index + 1 }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{
                t('common.label.name')
              }}</span>
              <span
                class="font-medium text-text outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[50px]"
                :contenteditable="filterStatus === 'active'"
                @blur="handleCellBlur($event, cat, 'name', validateCategoryName)"
                @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                >{{ cat.name }}</span
              >
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2' : 'px-6 py-4 text-right'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{
                t('master_data.category.col_product_count')
              }}</span>
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums"
                :class="(cat.product_count ?? 0) > 0 ? 'bg-primary/10 text-primary' : 'bg-secondary/20 text-text/50'"
              >
                {{ cat.product_count ?? 0 }}
              </span>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && filteredCategories.length > 0" class="mt-4 rounded-xl overflow-hidden">
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
    :options="contextMenuOptions"
    @close="contextMenu.visible = false"
    @action="handleContextAction"
  />

  <!-- Modal untuk Tambah/Edit Kategori -->
  <Teleport to="body">
    <BaseModal
      :show="isModalOpen"
      @close="isModalOpen = false"
      :title="isEditing ? t('master_data.category.modal_title_edit') : t('master_data.category.modal_title_add')"
    >
      <form @submit.prevent="handleSave" class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">{{ t('master_data.category.col_name') }}</label>
          <input
            v-model="form.name"
            type="text"
            required
            class="w-full input-field"
            :placeholder="t('master_data.category.name_placeholder')"
            autofocus
          />
        </div>
      </form>
      <template #footer>
        <button type="button" @click="isModalOpen = false" class="btn-secondary">{{ t('common.btn.cancel') }}</button>
        <button type="submit" @click="handleSave" :disabled="saving" class="btn-primary">
          <font-awesome-icon v-if="saving" icon="fa-solid fa-circle-notch" class="animate-spin mr-1" />
          {{ t('common.btn.save') }}
        </button>
      </template>
    </BaseModal>
  </Teleport>
</template>

<style lang="postcss" scoped>
.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary text-text;
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
