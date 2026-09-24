<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, computed, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import instance from '@/api/axios'
import { useProductSearch } from '@/composables/useProductSearch.js'
import { useToast } from '@/composables/useToast.js'
import { useAuthStore } from '@/stores/auth.js'
import { formatBytes } from '@/utils/formatBytes.js'
import { resolveUrl } from '@/composables/useImageUrl'
import { useMobile } from '@/composables/useMobile.js'
import { formatTags } from '@/utils/formatters.js'
import { useFloating, autoUpdate, offset, flip, shift, size } from '@floating-ui/vue'

const { isMobile } = useMobile()

const props = defineProps({
  show: Boolean,
  mediaId: [Number, String]
})
const emit = defineEmits(['close', 'refresh'])

const { toast } = useToast()
const authStore = useAuthStore()

const loading = ref(false)
const fetching = ref(false)
const mediaData = ref(null)

// using the same permissions because linking images to products conceptually belongs to product.image.upload
const canUpload = computed(() => authStore.hasPermission('product.image.upload'))
const canDelete = computed(() => authStore.hasPermission('product.image.delete'))

const imgBroken = ref(false)

// getImageUrl is now resolveUrl from useImageUrl
const getImageUrl = resolveUrl

async function fetchMediaDetails() {
  if (!props.mediaId) return
  fetching.value = true
  try {
    const { data } = await instance.get(`/media/${props.mediaId}`)
    if (data.success) {
      mediaData.value = data.data
    }
  } catch (error) {
    console.error('Fetch Media Failed', error)
  } finally {
    fetching.value = false
  }
}

watch(
  () => props.show,
  val => {
    if (val) {
      mediaData.value = null
      clearSearch()
      isEditingTags.value = false
      tagsInput.value = ''
      fetchMediaDetails()
    }
  }
)

// Tag Editing Logic
const isEditingTags = ref(false)
const tagsInput = ref('')
const loadingTags = ref(false)

function startEditTags() {
  tagsInput.value = formatTags(mediaData.value?.tags).join(', ')
  isEditingTags.value = true
}

async function saveTags() {
  if (!props.mediaId) return

  const rawTags = tagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  loadingTags.value = true
  try {
    const { data } = await instance.put(`/media/${props.mediaId}/tags`, {
      tags: rawTags
    })
    if (data.success) {
      toast('Tag berhasil diperbarui', 'success')
      isEditingTags.value = false
      await fetchMediaDetails()
      emit('refresh')
    }
  } catch (err) {
    console.error('Update Tags Error', err)
  } finally {
    loadingTags.value = false
  }
}

// Auto-complete — powered by useProductSearch composable
const {
  query: searchQuery,
  results: searchResults,
  isSearching: searching,
  clear: clearSearch
} = useProductSearch({ maxResults: 5 })

const triggerRef = ref(null)
const dropdownRef = ref(null)

const { floatingStyles } = useFloating(triggerRef, dropdownRef, {
  placement: 'bottom-start',
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(4),
    flip(),
    shift({ padding: 8 }),
    size({
      apply({ rects, elements }) {
        Object.assign(elements.floating.style, {
          width: `${rects.reference.width}px`
        })
      }
    })
  ]
})

async function linkProduct(product) {
  if (!product || !props.mediaId) return
  const existing = mediaData.value?.products?.find(p => p.id === product.id)
  if (existing) {
    toast('Produk sudah terkait dengan gambar ini.', 'warning')
    return
  }

  loading.value = true
  try {
    const payload = { mediaIds: [Number(props.mediaId)] }
    const { data } = await instance.post(`/products/${product.id}/link-media`, payload)
    if (data.success) {
      toast('Produk berhasil disematkan!', 'success')
      clearSearch()
      await fetchMediaDetails() // Refresh within the modal to show newly linked
      emit('refresh') // Refresh the list underneath
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function unlinkProduct(productRaw) {
  if (!(await swalConfirm(`Lepaskan gambar dari produk ${productRaw.sku}?`))) return
  loading.value = true
  try {
    const { data } = await instance.delete(`/products/${productRaw.id}/images/${productRaw.pivot_id}`)
    if (data.success) {
      toast('Tautan produk dilepaskan.', 'success')
      await fetchMediaDetails()
      emit('refresh')
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

// --- TITLE EDITING ---
const isEditingTitle = ref(false)
const editTitle = ref('')
const loadingTitle = ref(false)

const startEditTitle = () => {
  editTitle.value = mediaData.value?.title || ''
  isEditingTitle.value = true
}

const saveTitle = async () => {
  if (!editTitle.value.trim()) {
    toast('Judul tidak boleh kosong', 'warning')
    return
  }
  loadingTitle.value = true
  try {
    const { data } = await instance.put(`/media/${props.mediaId}/title`, { title: editTitle.value })
    if (data.success) {
      toast('Judul berhasil diperbarui', 'success')
      isEditingTitle.value = false
      await fetchMediaDetails()
      emit('refresh')
    }
  } catch (err) {
    console.error(err)
  } finally {
    loadingTitle.value = false
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, pressed => {
  if (pressed && props.show && isEditingTags.value && !loadingTags.value) {
    saveTags()
  }
})
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    @click.self="$emit('close')"
  >
    <div
      class="bg-background w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] transition-all"
    >
      <!-- Left: Image Preview -->
      <div
        class="w-full md:w-1/2 bg-secondary/50 flex flex-col items-center justify-center relative p-6 border-r border-secondary/10"
      >
        <div
          v-if="fetching"
          class="absolute inset-0 flex items-center justify-center bg-background/80 z-10 backdrop-blur-sm"
        >
          <font-awesome-icon icon="fa-solid fa-spinner" spin class="text-primary text-3xl" />
        </div>

        <img
          v-if="
            mediaData &&
            getImageUrl(mediaData.main_path || mediaData.thumbnail_path || mediaData.temp_filepath) &&
            !imgBroken
          "
          :src="getImageUrl(mediaData.main_path || mediaData.thumbnail_path || mediaData.temp_filepath)"
          class="w-full h-auto rounded-xl shadow-lg border border-secondary/20 object-contain max-h-full max-w-[90%]"
          @error="imgBroken = true"
        />
        <div
          v-else-if="mediaData"
          class="w-full h-64 flex flex-col items-center justify-center text-text/20 rounded-xl border border-secondary/20 bg-secondary/5"
        >
          <font-awesome-icon icon="fa-solid fa-image" class="text-6xl mb-2" />
          <span class="text-sm font-medium">Gambar tidak tersedia</span>
        </div>

        <button
          @click="$emit('close')"
          class="absolute top-4 left-4 md:hidden w-8 h-8 bg-secondary/20 flex items-center justify-center rounded-full text-text"
        >
          <font-awesome-icon icon="fa-solid fa-arrow-left" />
        </button>
      </div>

      <!-- Right: Info & Products -->
      <div class="w-full md:w-1/2 flex flex-col bg-background relative h-full">
        <!-- Header Close Desktop -->
        <button
          @click="$emit('close')"
          class="absolute top-4 right-4 hidden md:flex w-8 h-8 items-center justify-center rounded-full hover:bg-secondary/20 text-text/50 hover:text-text transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-times" />
        </button>

        <div class="p-4 flex-1 overflow-y-auto w-full">
          <div class="mb-2">
            <h3 class="font-bold text-xl text-text mb-1">Detail Media</h3>

            <div v-if="!isEditingTitle" class="flex items-center gap-2 group">
              <p class="text-xs text-text/50 font-mono truncate max-w-sm" :title="mediaData?.title">
                {{ mediaData?.title || 'Memuat...' }}
              </p>
              <button @click="startEditTitle" class="text-primary/50 hover:text-primary" title="Edit Judul">
                <font-awesome-icon icon="fa-solid fa-pen" class="text-[10px]" />
              </button>
            </div>

            <div v-else class="flex items-center gap-2 mt-1">
              <input
                type="text"
                v-model="editTitle"
                @keyup.enter="saveTitle"
                @keyup.esc="isEditingTitle = false"
                class="flex-1 bg-background border border-primary/30 rounded px-2 py-1 text-xs text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono"
                placeholder="Judul gambar..."
                :disabled="loadingTitle"
              />
              <button @click="saveTitle" :disabled="loadingTitle" class="text-success hover:text-success/80">
                <font-awesome-icon
                  :icon="loadingTitle ? 'fa-solid fa-spinner' : 'fa-solid fa-check'"
                  :spin="loadingTitle"
                />
              </button>
              <button @click="isEditingTitle = false" :disabled="loadingTitle" class="text-danger hover:text-danger/80">
                <font-awesome-icon icon="fa-solid fa-times" />
              </button>
            </div>
          </div>

          <template v-if="mediaData && !fetching">
            <!-- Meta Stats -->
            <div class="grid grid-cols-2 gap-4 mb-2">
              <div class="bg-secondary/5 rounded-lg p-3 border border-secondary/10">
                <span class="block text-[10px] text-text/50 font-bold uppercase mb-1">Status</span>
                <span
                  class="text-sm font-semibold flex items-center gap-1"
                  :class="mediaData.status === 'COMPLETED' ? 'text-success' : 'text-primary'"
                >
                  <font-awesome-icon
                    :icon="mediaData.status === 'COMPLETED' ? 'fa-solid fa-check-circle' : 'fa-solid fa-spinner'"
                    :spin="mediaData.status !== 'COMPLETED'"
                  />
                  {{ mediaData.status }}
                </span>
              </div>
              <div class="bg-secondary/5 rounded-lg p-3 border border-secondary/10">
                <span class="block text-[10px] text-text/50 font-bold uppercase mb-1">Diunggah</span>
                <span class="text-sm font-mono text-text/80">{{
                  new Date(mediaData.created_at).toLocaleDateString('id-ID')
                }}</span>
              </div>
            </div>

            <!-- Informasi File -->
            <div v-if="mediaData.width || mediaData.size_bytes" class="mb-4">
              <span class="block text-[10px] text-text/50 font-bold uppercase mb-2">Informasi File</span>
              <div class="grid grid-cols-2 gap-3">
                <div
                  v-if="mediaData.width && mediaData.height"
                  class="bg-secondary/5 rounded-lg p-3 border border-secondary/10 flex items-center gap-2"
                >
                  <font-awesome-icon icon="fa-solid fa-ruler-combined" class="text-primary/60 text-sm" />
                  <div>
                    <span class="block text-[10px] text-text/50 font-bold uppercase">Dimensi</span>
                    <span class="text-sm font-mono text-text/80"
                      >{{ mediaData.width }} × {{ mediaData.height }} px</span
                    >
                  </div>
                </div>
                <div
                  v-if="mediaData.size_bytes"
                  class="bg-secondary/5 rounded-lg p-3 border border-secondary/10 flex items-center gap-2"
                >
                  <font-awesome-icon icon="fa-solid fa-file" class="text-primary/60 text-sm" />
                  <div>
                    <span class="block text-[10px] text-text/50 font-bold uppercase">Ukuran</span>
                    <span class="text-sm font-mono text-text/80">{{ formatBytes(mediaData.size_bytes) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tags -->
            <div class="mb-2 border border-secondary rounded-lg p-2">
              <div class="flex justify-between items-center mb-2">
                <span class="block text-[10px] text-text/50 font-bold uppercase">Global Tags</span>
                <button
                  v-if="!isEditingTags && canUpload"
                  @click="startEditTags"
                  class="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 transition-colors"
                >
                  <font-awesome-icon icon="fa-solid fa-pen" /> Edit Tag
                </button>
              </div>

              <div v-if="isEditingTags" class="bg-secondary/5 border border-secondary/20 rounded-lg p-3">
                <div class="form-control mb-3">
                  <input
                    type="text"
                    v-model="tagsInput"
                    @keyup.enter="saveTags"
                    placeholder="Ketik tag, pisahkan dengan koma (mis: promo, front)"
                    class="input input-sm border-secondary focus:border-primary bg-background text-text w-full text-xs transition-colors"
                    :disabled="loadingTags"
                  />
                </div>
                <div class="flex justify-end gap-2">
                  <button
                    @click="isEditingTags = false"
                    class="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase bg-background border border-secondary hover:bg-secondary text-text transition-colors"
                    :disabled="loadingTags"
                  >
                    Batal
                  </button>
                  <button
                    @click="saveTags"
                    class="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase bg-primary text-background hover:bg-accent transition-colors flex items-center gap-1 min-w-[80px] justify-center"
                    :disabled="loadingTags"
                  >
                    <font-awesome-icon v-if="loadingTags" icon="fa-solid fa-spinner" spin />
                    <span v-else><font-awesome-icon icon="fa-solid fa-save" class="mr-1" /> Simpan</span>
                  </button>
                </div>
              </div>

              <div v-else class="flex flex-wrap gap-2">
                <span
                  v-for="tag in formatTags(mediaData.tags)"
                  :key="tag"
                  class="px-2 py-1 bg-secondary/10 text-text/70 rounded-md text-[10px] border border-secondary/20 font-bold uppercase"
                >
                  #{{ tag }}
                </span>
                <span v-if="formatTags(mediaData.tags).length === 0" class="text-xs text-text/40 italic">
                  Tidak ada tag.
                </span>
              </div>
            </div>

            <!-- Attached Products -->
            <div class="mb-1">
              <h4 class="font-bold text-sm text-text flex items-center justify-between mb-3">
                Sematan Produk
                <span class="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full font-mono">
                  {{ mediaData.products?.length || 0 }}
                </span>
              </h4>

              <!-- Product Search & Attach -->
              <div class="mb-2 relative" v-if="canUpload && mediaData.status === 'COMPLETED'">
                <span class="block text-[10px] text-text/50 font-bold uppercase mb-2">Tautkan ke Produk Baru</span>
                <div class="relative" ref="triggerRef">
                  <font-awesome-icon
                    icon="fa-solid fa-search"
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40"
                  />
                  <input
                    type="text"
                    v-model="searchQuery"
                    placeholder="Cari Kode SKU / Nama Produk..."
                    class="w-full bg-background border-2 border-secondary rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-text/30 text-text transition-colors"
                  />
                  <font-awesome-icon
                    v-if="searching"
                    icon="fa-solid fa-spinner"
                    spin
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-primary"
                  />
                </div>

                <!-- Dropdown List -->
                <teleport to="body">
                  <div
                    v-if="searchResults.length > 0 && show"
                    ref="dropdownRef"
                    :style="floatingStyles"
                    class="absolute z-[1500] bg-background border border-secondary/20 shadow-xl rounded-lg max-h-48 overflow-y-auto"
                  >
                    <button
                      v-for="res in searchResults"
                      :key="res.id"
                      @click="linkProduct(res)"
                      class="w-full text-left px-4 py-2 hover:bg-primary/5 border-b border-secondary/10 last:border-0 flex items-center justify-between group transition-colors"
                    >
                      <div class="flex flex-col">
                        <span class="font-mono text-[10px] text-text/60 font-bold">{{ res.sku }}</span>
                        <span class="text-xs font-semibold text-text/90">{{ res.name }}</span>
                      </div>
                      <div
                        class="w-6 h-6 flex items-center justify-center rounded-full bg-primary/10 text-primary transition-opacity"
                        :class="isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                      >
                        <font-awesome-icon icon="fa-solid fa-plus" class="text-xs" />
                      </div>
                    </button>
                  </div>
                </teleport>
              </div>
              <div
                v-else-if="mediaData.status !== 'COMPLETED'"
                class="p-3 bg-secondary/10 rounded-lg border border-secondary/20 text-center flex flex-col items-center justify-center"
              >
                <font-awesome-icon icon="fa-solid fa-info-circle" class="text-text/40 text-lg mb-1" />
                <p class="text-[10px] font-bold text-text/50 uppercase">Tunggu Kompresi Selesai Sebelum Menautkan</p>
              </div>

              <div
                v-if="mediaData.products?.length > 0"
                class="flex rounded-lg flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2"
              >
                <div
                  v-for="prod in mediaData.products"
                  :key="prod.id"
                  class="flex items-center justify-between bg-secondary/20 border border-secondary/20 p-2 rounded-lg shadow-sm hover:border-text/20 transition-colors"
                >
                  <div class="flex items-center gap-2">
                    <span
                      class="font-mono bg-secondary/60 border border-secondary/20 px-1.5 py-0.5 rounded text-[10px] text-text/80 font-bold"
                    >
                      {{ prod.sku }}
                    </span>
                    <span class="text-xs font-semibold text-text">
                      {{ prod.name }}
                    </span>
                  </div>
                  <button
                    v-if="canDelete"
                    @click="unlinkProduct(prod)"
                    :disabled="loading"
                    class="w-7 h-7 flex items-center justify-center rounded-md bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors flex-shrink-0"
                    title="Lepaskan Produk"
                  >
                    <font-awesome-icon icon="fa-solid fa-link-slash" class="text-xs" />
                  </button>
                </div>
              </div>
              <div
                v-else
                class="text-center p-4 border border-dashed border-secondary/30 rounded-xl bg-secondary/5 mt-2"
              >
                <font-awesome-icon icon="fa-solid fa-box-open" class="text-text/30 text-2xl mb-2" />
                <p class="text-xs text-text/50 font-semibold mb-1">Aset ini belum dipasang ke produk apapun.</p>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
