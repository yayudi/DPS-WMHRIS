<script setup>
import { ref, onMounted } from 'vue'
import { useFirebaseSync } from '@/composables/useFirebaseSync'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/axios.js'
import { swalConfirm } from '@/composables/useSweetAlert'
import BaseModal from '@/components/ui/BaseModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import WmsActionHeader from '@/components/wms/shared/WmsActionHeader.vue'
import { useMobile } from '@/composables/useMobile.js'
import { usePagination } from '@/composables/usePagination.js'
import BaseContextMenu from '@/components/ui/BaseContextMenu.vue'
import { useContextMenu } from '@/composables/useContextMenu.js'
import { useInstantInlineEdit } from '@/composables/useInstantInlineEdit.js'

const { isMobile } = useMobile()
const { toast } = useToast()

const channels = ref([])
const isLoading = ref(false)
const isSaving = ref(false)

const isModalOpen = ref(false)
const modalMode = ref('add') // 'add' or 'edit'

const {
  paginatedData: visibleChannels,
  meta: pagination,
  changePage,
  changePageSize
} = usePagination({
  totalItems: channels,
  storageKey: 'channelPageSize',
  initialLimit: 10
})

const formData = ref({
  id: null,
  platform: 'Shopee',
  name: '',
  description: '',
  isActive: true
})

const platformOptions = ['Shopee', 'Tokopedia', 'Offline', 'Lainnya']

// Modal hapus diganti dengan swalConfirm

onMounted(() => {
  fetchChannels()
})

useFirebaseSync('MASTER_DATA', 'REFRESH_CHANNELS', () => fetchChannels(true))

const fetchChannels = async (silent = false) => {
  if (!silent) isLoading.value = true
  try {
    const res = await api.get('/sales-channels')
    channels.value = res.data?.data || []
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isLoading.value = false
  }
}

const openModal = (mode, item = null) => {
  modalMode.value = mode
  if (mode === 'edit') {
    formData.value = {
      id: item.id,
      platform: item.platform,
      name: item.name,
      description: item.description || '',
      isActive: item.is_active === 1 || item.is_active === true
    }
  } else {
    formData.value = {
      id: null,
      platform: 'Shopee',
      name: '',
      description: '',
      isActive: true
    }
  }
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
}

const saveChannel = async () => {
  if (!formData.value.name) {
    toast('Nama Toko / Sales harus diisi.', 'warning')
    return
  }

  isSaving.value = true
  try {
    const payload = {
      platform: formData.value.platform,
      name: formData.value.name,
      description: formData.value.description,
      isActive: formData.value.isActive
    }

    if (modalMode.value === 'add') {
      await api.post('/sales-channels', payload)
      toast('Saluran berhasil ditambahkan.', 'success')
    } else {
      await api.put(`/sales-channels/${formData.value.id}`, payload)
      toast('Saluran berhasil diperbarui.', 'success')
    }

    closeModal()
    fetchChannels()
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isSaving.value = false
  }
}

const confirmDelete = async item => {
  if (
    !(await swalConfirm(
      'Konfirmasi Hapus',
      `Apakah Anda yakin ingin menghapus saluran ${item.name}? Data ini akan dinonaktifkan (soft delete) untuk menjaga integritas data riwayat penjualan.`
    ))
  )
    return

  try {
    await api.delete(`/sales-channels/${item.id}`)
    toast('Saluran berhasil dihapus.', 'success')
    fetchChannels()
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  }
}

// --- INLINE EDIT HANDLERS ---
const { contextMenu, openContextMenu } = useContextMenu()
const { handleCellBlur, handleDropdownChange } = useInstantInlineEdit(
  async (id, payload) => {
    await api.put(`/sales-channels/${id}`, payload)
  },
  item => ({
    platform: item.platform,
    name: item.name,
    description: item.description,
    isActive: item.is_active === 1 || item.is_active === true
  })
)

const validateChannelName = val => {
  if (!val) {
    toast('Nama Toko / Sales harus diisi.', 'warning')
    return false
  }
  return true
}

const handleContextAction = action => {
  if (action === 'delete') {
    confirmDelete(contextMenu.value.row)
  } else if (action === 'edit') {
    openModal('edit', contextMenu.value.row)
  }
}
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- Header -->
    <WmsActionHeader
      title="Manajemen Saluran Penjualan"
      description="Kelola referensi nama toko / sales untuk form upload picking list."
      icon="fa-solid fa-store"
    >
      <template #actions>
        <button
          @click="openModal('add')"
          class="bg-primary text-secondary text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-md shadow-primary/20"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
          <span>Tambah Saluran</span>
        </button>
      </template>
    </WmsActionHeader>

    <!-- Table Content -->
    <div>
      <div
        class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(95vh-100px)] table-container"
      >
        <table class="w-full text-sm text-left text-text border-collapse" :class="isMobile ? 'block' : 'min-w-[600px]'">
          <thead
            class="bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5"
            :class="isMobile ? 'hidden' : 'sticky top-0 z-30'"
          >
            <tr class="text-xs text-text/80 uppercase">
              <th class="px-6 py-3 border-b border-secondary/10">Platform</th>
              <th class="px-6 py-3 border-b border-secondary/10">Nama Toko / Sales</th>
              <th class="px-6 py-3 border-b border-secondary/10">Keterangan</th>
              <th class="px-6 py-3 border-b border-secondary/10 text-center">Status</th>
            </tr>
          </thead>
          <TransitionGroup
            tag="tbody"
            name="list"
            class="relative"
            :class="isMobile ? 'block' : 'divide-y divide-secondary/5'"
          >
            <!-- Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
                <td class="px-6 py-4"><BaseSkeleton shape="rect" className="w-16 h-6 rounded-lg" /></td>
                <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-1/2 h-4" /></td>
                <td class="px-6 py-4"><BaseSkeleton shape="text" className="w-3/4 h-4" /></td>
                <td class="px-6 py-4 text-center">
                  <BaseSkeleton shape="rect" className="w-12 h-5 mx-auto rounded-lg" />
                </td>
              </tr>
            </template>

            <tr v-else-if="channels.length === 0" key="empty">
              <td colspan="4" class="py-12 text-center text-text/50 italic">
                <font-awesome-icon icon="fa-solid fa-store-slash" class="text-3xl text-text/20 mb-3 block" />
                Belum ada data saluran penjualan.
              </td>
            </tr>

            <tr
              v-else
              v-for="item in visibleChannels"
              :key="item.id"
              class="transition-colors group relative"
              :class="
                isMobile
                  ? 'block mb-3 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                  : 'border-b border-secondary/20 hover:bg-secondary/5'
              "
              @contextmenu.prevent.stop="openContextMenu($event, item)"
            >
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Platform</span>
                <select
                  class="outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded text-xs text-background font-bold cursor-pointer"
                  :class="
                    item.platform === 'Shopee'
                      ? 'bg-warning'
                      : item.platform === 'Tokopedia'
                        ? 'bg-success'
                        : 'bg-primary'
                  "
                  :value="item.platform"
                  @change="handleDropdownChange(item, 'platform', $event.target.value)"
                >
                  <option v-for="opt in platformOptions" :key="opt" :value="opt" class="bg-background text-text">
                    {{ opt }}
                  </option>
                </select>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Nama Toko</span>
                <span
                  class="font-medium text-text outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[50px]"
                  contenteditable="true"
                  @blur="handleCellBlur($event, item, 'name', validateChannelName)"
                  @keydown.enter.prevent="$event.target.blur()"
                  >{{ item.name }}</span
                >
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Keterangan</span>
                <span
                  class="text-text/60 truncate max-w-xs outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded inline-block min-w-[50px]"
                  contenteditable="true"
                  @blur="handleCellBlur($event, item, 'description')"
                  @keydown.enter.prevent="$event.target.blur()"
                  >{{ item.description || '' }}</span
                >
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'px-6 py-4 text-center'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Status</span>
                <select
                  class="text-background outline-none focus:ring-2 focus:ring-primary focus:bg-background/80 px-1 -mx-1 rounded text-xs font-bold cursor-pointer"
                  :class="item.is_active === 1 || item.is_active === true ? 'bg-success' : 'bg-danger'"
                  :value="item.is_active === 1 || item.is_active === true"
                  @change="handleDropdownChange(item, 'is_active', $event.target.value === 'true')"
                >
                  <option :value="true" class="bg-background text-text">Aktif</option>
                  <option :value="false" class="bg-background text-text">Nonaktif</option>
                </select>
              </td>
            </tr>
          </TransitionGroup>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="!isLoading && channels.length > 0" class="mt-4 rounded-xl overflow-hidden">
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
        { label: 'Hapus Saluran', action: 'delete', icon: 'fa-solid fa-trash', danger: true }
      ]"
      @close="contextMenu.visible = false"
      @action="handleContextAction"
    />

    <!-- Form Modal -->
    <Teleport to="body">
      <BaseModal :show="isModalOpen" @close="closeModal" maxWidth="max-w-md" class="mt-[-10vh]">
        <template #title>
          <div class="-mt-1">
            <h3 class="font-bold text-text">
              {{ modalMode === 'add' ? 'Tambah Saluran Penjualan' : 'Edit Saluran Penjualan' }}
            </h3>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-text/70 mb-1">Platform <span class="text-danger">*</span></label>
            <select
              v-model="formData.platform"
              class="w-full bg-background border border-secondary/30 rounded-lg px-3 py-2 text-sm text-text focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none"
            >
              <option v-for="opt in platformOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-text/70 mb-1"
              >Nama Toko / Sales <span class="text-danger">*</span></label
            >
            <input
              v-model="formData.name"
              type="text"
              placeholder="Contoh: Toko Maju Jaya"
              class="w-full bg-background border border-secondary/30 rounded-lg px-3 py-2 text-sm text-text focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-text/70 mb-1">Keterangan (Opsional)</label>
            <textarea
              v-model="formData.description"
              rows="2"
              placeholder="Contoh: Akun cabang Budi"
              class="w-full bg-background border border-secondary/30 rounded-lg px-3 py-2 text-sm text-text focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none resize-none"
            ></textarea>
          </div>

          <div class="pt-2">
            <label class="flex items-center gap-3 cursor-pointer group">
              <div class="relative flex items-center">
                <input type="checkbox" v-model="formData.isActive" class="peer sr-only" />
                <div
                  class="w-10 h-5 bg-secondary/30 rounded-full peer-checked:bg-success transition-colors duration-200"
                ></div>
                <div
                  class="absolute left-1 top-1 w-3 h-3 bg-secondary rounded-full transition-transform duration-200 peer-checked:translate-x-5 shadow-sm"
                ></div>
              </div>
              <div>
                <span class="text-sm font-bold text-text group-hover:text-primary transition-colors"
                  >Saluran Aktif</span
                >
                <p class="text-[10px] text-text/50">Nonaktifkan jika toko tutup / sales resign.</p>
              </div>
            </label>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3 w-full">
            <button
              @click="closeModal"
              class="px-4 py-2 text-sm font-bold text-text/60 hover:text-text transition-colors"
            >
              Batal
            </button>
            <button
              @click="saveChannel"
              :disabled="isSaving"
              class="px-6 py-2 bg-primary text-secondary text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <font-awesome-icon v-if="isSaving" icon="fa-solid fa-spinner" spin />
              Simpan
            </button>
          </div>
        </template>
      </BaseModal>

      <!-- Delete Confirmation Modal (Dihapus karena sudah menggunakan swalConfirm) -->
    </Teleport>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
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
