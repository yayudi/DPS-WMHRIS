<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import axios from '@/core/infrastructure/http.client'
import { uploadMediaToR2 } from '@/utils/mediaUploader'
import apiClient from '@/core/infrastructure/http.client'
import { resolveUrl } from '@/composables/useImageUrl'
import MediaCard from '@/components/common/MediaCard.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import debounce from 'lodash/debounce'
import { isGenericTitle, stripExtension } from '@/utils/mediaUtils'

const props = defineProps({
  show: Boolean,
  defaultTags: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'select'])

const { toast } = useToast()
const authStore = useAuthStore()

const loading = ref(false)
const fetching = ref(false)
const selectedImages = ref([])
const existingImages = ref([])
const searchQuery = ref('')

const canUpload = computed(() => authStore.hasPermission('product.image.upload')) // Assuming this is the global upload permission

const fetchImages = async () => {
  fetching.value = true
  try {
    const { data } = await axios.get('/media', {
      params: {
        page: 1,
        limit: 100, // Fetch up to 100 recent assets for the picker
        search: searchQuery.value
      }
    })
    if (data.success && data.data) {
      existingImages.value = data.data
    }
  } catch (error) {
    console.error('Fetch Media Error:', error)
  } finally {
    fetching.value = false
  }
}

const debouncedFetch = debounce(fetchImages, 500)

watch(searchQuery, () => {
  debouncedFetch()
})

watch(
  () => props.show,
  val => {
    if (val) {
      loading.value = false
      selectedImages.value = []
      existingImages.value = []
      searchQuery.value = ''
      fetchImages()
    }
  }
)

const fileTitles = ref([])



async function handleImageUpload(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return

  const validFiles = files.filter(f => f.type.match('image.*'))
  if (validFiles.length < files.length) {
    toast('Beberapa file bukan gambar dan diabaikan.', 'warning')
  }

  if (validFiles.length === 0) return

  validFiles.forEach(file => {
    file.preview = URL.createObjectURL(file)
    selectedImages.value.push(file)
    fileTitles.value.push(stripExtension(file.name))
  })

  event.target.value = ''
}

function removeSelectedImage(index) {
  selectedImages.value.splice(index, 1)
  fileTitles.value.splice(index, 1)
}

const handlePaste = event => {
  if (!props.show) return
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return

  const items = event.clipboardData?.items
  if (!items) return

  const validFiles = []
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile()
      if (file) validFiles.push(file)
    }
  }

  if (validFiles.length > 0) {
    validFiles.forEach(file => {
      file.preview = URL.createObjectURL(file)
      selectedImages.value.push(file)
      fileTitles.value.push(stripExtension(file.name))
    })
  }
}

onMounted(() => {
  window.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
  if (debouncedFetch) debouncedFetch.cancel()
})



async function saveNewImages() {
  if (selectedImages.value.length === 0) return

  const invalidIndex = fileTitles.value.findIndex(t => isGenericTitle(t))
  if (invalidIndex !== -1) {
    toast(`Silakan ubah nama file "${fileTitles.value[invalidIndex]}" menjadi lebih deskriptif.`, 'warning')
    return
  }

  loading.value = true
  try {
    const data = await uploadMediaToR2(
      apiClient,
      selectedImages.value,
      fileTitles.value,
      props.defaultTags.length > 0 ? props.defaultTags : [],
      []
    );

    if (data.success) {
      toast(`${selectedImages.value.length} gambar berhasil diunggah.`, 'success')
      selectedImages.value = []
      fileTitles.value = []

      // Refresh list immediately (no need for worker delay)
      await fetchImages()
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    const errData = error.response?.data
    if (errData?.error_code === 'DUPLICATE_MEDIA') {
      toast(`Duplikat: ${errData.message}`, 'warning')
    } else {
      console.error(error)
    }
  } finally {
    loading.value = false
  }
}

const selectImage = img => {
  emit('select', img)
  emit('close')
}

const getImageUrl = resolveUrl
</script>

<template>
  <BaseModal :show="show" @close="$emit('close')" maxWidth="max-w-4xl">
    <template #title>
      <div class="-mt-1">
        <h3 class="font-bold text-lg text-text">Pilih Media</h3>
        <p class="text-xs text-text/60 font-mono font-normal mt-1">Galeri Aset Media</p>
      </div>
    </template>

    <div class="flex flex-col gap-6 h-[70vh] pb-6 overflow-y-auto custom-scrollbar">
      <!-- Search Bar -->
      <div
        class="flex items-center gap-2 sticky top-0 bg-background/90 backdrop-blur-sm z-10 py-2 border-b border-secondary/20"
      >
        <font-awesome-icon icon="fa-solid fa-search" class="text-text/50" />
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Cari berdasarkan judul atau tag..."
          class="flex-1 bg-transparent border-none focus:ring-0 text-sm p-2 outline-none"
        />
      </div>

      <div
        v-if="fetching && existingImages.length === 0"
        class="flex flex-col items-center justify-center py-12 text-text/40"
      >
        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-3xl mb-3" />
        <span class="text-sm">Memuat galeri...</span>
      </div>

      <div v-else class="flex flex-col gap-8">
        <div v-if="canUpload" class="border-t border-secondary/10 pb-6">
          <div class="flex justify-between items-center mb-3">
            <h4 class="font-bold text-text/80 text-sm uppercase tracking-wide">Upload Gambar Baru</h4>
          </div>
          <div class="flex flex-col gap-4">
            <label
              class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-primary/30 rounded-xl cursor-pointer bg-primary/5 hover:bg-primary/10 transition-colors group"
            >
              <div
                class="flex flex-col items-center justify-center pt-5 pb-6 text-primary group-hover:scale-105 transition-transform"
              >
                <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-3xl mb-2" />
                <p class="text-sm font-bold">Klik untuk pilih gambar</p>
                <p class="text-xs opacity-70">
                  Bisa pilih banyak sekaligus atau tekan <strong>CTRL+V</strong> untuk paste (Max 5MB)
                </p>
              </div>
              <input
                type="file"
                @change="handleImageUpload"
                accept="image/*"
                class="hidden"
                multiple
                :disabled="loading"
              />
            </label>
            <div v-if="selectedImages.length > 0" class="flex flex-col gap-3 animate-slide-up">
              <!-- File Item List with Title Edit -->
              <div class="flex flex-col gap-2">
                <div
                  v-for="(file, idx) in selectedImages"
                  :key="idx"
                  class="flex flex-col md:flex-row gap-3 items-start md:items-center p-3 bg-secondary/5 rounded-lg border border-secondary/20 hover:border-primary/30 transition-colors"
                >
                  <div class="flex items-center gap-3 w-full md:w-auto shrink-0">
                    <div
                      class="relative w-16 h-16 rounded overflow-hidden bg-background border border-secondary/10 group"
                    >
                      <img :src="file.preview" class="w-full h-full object-cover" />
                    </div>
                    <div class="flex flex-col flex-1 min-w-0">
                      <span class="text-xs font-bold text-text truncate" :title="file.name">{{ file.name }}</span>
                      <span class="text-[10px] text-text/50">{{ (file.size / 1024).toFixed(1) }} KB</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 w-full md:w-auto md:flex-1 mt-2 md:mt-0">
                    <div class="flex-1 relative">
                      <font-awesome-icon
                        icon="fa-solid fa-pen"
                        class="absolute left-3 top-1/2 -translate-y-1/2 text-text/30 text-xs"
                      />
                      <input
                        type="text"
                        v-model="fileTitles[idx]"
                        class="w-full bg-background border border-secondary/20 rounded pl-8 pr-3 py-1.5 text-xs text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        placeholder="Ubah judul gambar..."
                      />
                    </div>
                    <button
                      @click.prevent="removeSelectedImage(idx)"
                      class="shrink-0 w-8 h-8 rounded-full bg-danger/10 text-danger flex items-center justify-center hover:bg-danger hover:text-white transition-colors"
                      title="Batal Unggah"
                    >
                      <font-awesome-icon icon="fa-solid fa-times" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex justify-end gap-3 mt-4 border-t border-secondary/10 pt-4">
                <button
                  @click="((selectedImages = []), (fileTitles = []))"
                  class="px-4 py-2 text-text/60 font-bold hover:bg-secondary/10 rounded-lg text-sm transition-colors"
                >
                  Batal
                </button>
                <button
                  @click="saveNewImages"
                  :disabled="loading"
                  class="px-6 py-2 bg-primary hover:bg-primary-dark text-secondary font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all active:scale-95"
                >
                  <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin" />
                  <span v-else>Simpan ({{ selectedImages.length }})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-text/80 text-sm uppercase tracking-wide">Pilih Dari Galeri</h4>
            <span class="text-xs text-text/50">{{ existingImages.length }} gambar</span>
          </div>

          <div
            v-if="existingImages.length === 0"
            class="p-8 border-2 border-dashed border-secondary/20 rounded-xl flex flex-col items-center text-text/30 bg-secondary/5"
          >
            <font-awesome-icon icon="fa-solid fa-images" class="text-4xl mb-2" />
            <span class="text-sm font-medium">Belum ada gambar yang sesuai pencarian.</span>
          </div>

          <div v-else class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <MediaCard
              v-for="img in existingImages"
              :key="img.id"
              :image-url="getImageUrl(img.thumbnail_path || img.main_path)"
              :image-id="img.id"
              :display-name="img.title || 'Gambar'"
              @click="selectImage(img)"
              class="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            >
              <template #badges>
                <div
                  v-if="img.status === 'PENDING'"
                  class="absolute top-2 right-2 bg-warning text-text text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-10 flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-spinner" spin /> Proses
                </div>
              </template>
            </MediaCard>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.animate-slide-up {
  animation: slideUp 0.3s ease-out forwards;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
