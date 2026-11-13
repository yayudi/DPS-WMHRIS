<script setup>
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { uploadMediaToR2 } from '@/modules/master_data/application/utils/mediaUploader'
import { productApi } from '@/modules/master_data/infrastructure/product.api'
import { resolveUrl } from '@/modules/master_data/presentation/composables/useImageUrl'
import MediaCard from '@/core/presentation/components/common/MediaCard.vue'
import MediaActionBar from '@/core/presentation/components/common/MediaActionBar.vue'
import MediaLightbox from '@/core/presentation/components/common/MediaLightbox.vue'
import { autoCropCenter } from '@/modules/master_data/application/utils/imageCropper'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import { isGenericTitle, stripExtension } from '@/modules/master_data/application/utils/mediaUtils'
import { useFirebaseSync } from '@/core/presentation/composables/useFirebaseSync'
import MediaPickerModal from '@/core/presentation/components/shared/MediaPickerModal.vue'
const ImageCropperModal = defineAsyncComponent(() => import('@/modules/master_data/presentation/components/ImageCropperModal.vue'))

const props = defineProps({
  show: Boolean,
  productData: Object
})

const emit = defineEmits(['close', 'refresh'])

const { toast } = useToast()
const { t } = useI18n()
const authStore = useAuthStore()

const loading = ref(false)
const fetching = ref(false)
const selectedImages = ref([])
const existingImages = ref([])
const isLightboxOpen = ref(false)
const lightboxIndex = ref(0)
const isMediaPickerOpen = ref(false)

const handleMediaSelect = async (media) => {
  loading.value = true
  try {
    const res = await productApi.linkMedia(props.productData.id, {
      mediaIds: [media.id]
    })
    toast(res?.message || t('common.status.success'), 'success')
    await fetchImages()
    emit('refresh')
  } catch (error) {
    console.error(error)
    const msg = error.response?.data?.message || t('master_data.media.link_error')
    toast(msg, 'error')
  } finally {
    loading.value = false
  }
}

/** Map existingImages to the shape MediaLightbox expects */
const lightboxImages = computed(() =>
  existingImages.value.map(img => ({
    main_path: img.image_path || img.main_path,
    thumbnail_path: img.thumbnail_path || img.image_path || img.main_path,
    title: img.title || t('master_data.media.default_product_title')
  }))
)

const canUpload = computed(() => authStore.hasPermission('product.image.upload'))
const canDelete = computed(() => authStore.hasPermission('product.image.delete'))

async function fetchImages() {
  if (!props.productData?.id) return
  fetching.value = true
  try {
    const fullData = await productApi.fetchProductById(props.productData.id)
    if (fullData && fullData.images) {
      existingImages.value = fullData.images
    } else {
      existingImages.value = []
    }
  } catch (error) {
    console.error('Fetch Images Error:', error)
  } finally {
    fetching.value = false
  }
}

// Auto-refresh gambar di modal jika ada pengguna lain yang menambah/menghapus gambar atau media
useFirebaseSync('MASTER_DATA', ['REFRESH_PRODUCTS', 'REFRESH_MEDIA'], () => {
  if (props.show) {
    fetchImages()
  }
})

const handlePaste = async event => {
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
    })
  }
}

onMounted(() => {
  window.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
})

watch(
  () => props.show,
  val => {
    if (val) {
      loading.value = false
      selectedImages.value = []
      existingImages.value = []
      fetchImages()
    }
  }
)

const fileTitles = ref([])
const uploadTagsStr = ref('')

async function handleImageUpload(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return

  const validFiles = files.filter(f => f.type.match('image.*'))
  if (validFiles.length < files.length) {
    toast(t('master_data.media.invalid_file_warning'), 'warning')
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

const autoCropAllProcessing = ref(false)

const autoCropAll = async () => {
  if (selectedImages.value.length === 0) return
  autoCropAllProcessing.value = true
  try {
    const newFiles = await autoCropCenter(selectedImages.value)
    newFiles.forEach(f => (f.preview = URL.createObjectURL(f)))
    selectedImages.value = newFiles
  } catch (error) {
    console.error('Auto crop failed:', error)
  } finally {
    autoCropAllProcessing.value = false
  }
}

const isCropperOpen = ref(false)
const currentEditIndex = ref(-1)
const currentEditFile = ref(null)

const openCropper = index => {
  currentEditIndex.value = index
  currentEditFile.value = selectedImages.value[index]
  isCropperOpen.value = true
}

const handleCroppedSave = newFile => {
  if (currentEditIndex.value !== -1) {
    newFile.preview = URL.createObjectURL(newFile)
    selectedImages.value[currentEditIndex.value] = newFile
  }
}

async function saveNewImages() {
  if (selectedImages.value.length === 0) return

  // Validasi judul generik
  const invalidIndex = fileTitles.value.findIndex(t => isGenericTitle(t))
  if (invalidIndex !== -1) {
    toast(t('master_data.media.rename_warning', { filename: fileTitles.value[invalidIndex] }), 'warning')
    return
  }

  loading.value = true
  let tags = []
  if (uploadTagsStr.value.trim()) {
    tags = uploadTagsStr.value
      .trim()
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
  }

  try {
    const data = await uploadMediaToR2(selectedImages.value, fileTitles.value, tags, [props.productData.id])

    if (data && (data.success || data.id)) {
      toast(t('master_data.media.upload_success_count', { count: selectedImages.value.length }), 'success')
      selectedImages.value = []
      fileTitles.value = []
      uploadTagsStr.value = ''

      setTimeout(async () => {
        await fetchImages()
        emit('refresh')
      }, 1500)
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    const errData = error.response?.data
    if (errData?.error_code === 'DUPLICATE_MEDIA') {
      toast(t('master_data.media.duplicate_warning', { message: errData.message, id: errData.duplicateOf }), 'warning')
    } else {
      console.error(error)
    }
  } finally {
    loading.value = false
  }
}

async function deleteImage(imageId) {
  if (!(await swalConfirm(t('master_data.media.confirm_delete')))) return

  loading.value = true
  try {
    const res = await productApi.deleteProductImage(props.productData.id, imageId)
    toast(res?.message || t('common.status.success'), 'success')
    await fetchImages()
    emit('refresh')
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function setPrimary(imageId) {
  loading.value = true
  try {
    const res = await productApi.setPrimaryImage(props.productData.id, imageId)
    toast(res?.message || t('common.status.success'), 'success')
    await fetchImages()
    emit('refresh')
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

// getImageUrl is now resolveUrl from useImageUrl
const getImageUrl = resolveUrl
</script>

<template>
  <BaseModal :show="show" @close="$emit('close')" maxWidth="max-w-4xl">
    <template #title>
      <div class="-mt-1">
        <h3 class="font-bold text-lg text-text">{{ t('master_data.media.gallery_title') }}</h3>
        <p class="text-xs text-text/60 font-mono font-normal mt-1">{{ productData.sku }} - {{ productData.name }}</p>
      </div>
    </template>

    <div class="flex flex-col gap-6 h-full pb-6 overflow-y-auto custom-scrollbar">
      <div v-if="fetching" class="flex flex-col items-center justify-center py-12 text-text/40">
        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-3xl mb-3" />
        <span class="text-sm">{{ t('master_data.media.gallery_loading') }}</span>
      </div>

      <div v-else class="flex flex-col gap-8">
        <div>
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-text/80 text-sm uppercase tracking-wide">{{ t('master_data.media.saved_photos') }}</h4>
            <span class="text-xs text-text/50">{{ existingImages.length }} {{ t('master_data.media.images_count') }}</span>
          </div>

          <div
            v-if="existingImages.length === 0"
            class="p-8 border-2 border-dashed border-secondary/20 rounded-xl flex flex-col items-center text-text/30 bg-secondary/5"
          >
            <font-awesome-icon icon="fa-solid fa-images" class="text-4xl mb-2" />
            <span class="text-sm font-medium">{{ t('master_data.media.no_photos') }}</span>
          </div>

          <div v-else class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <MediaCard
              v-for="(img, index) in existingImages"
              :key="img.id"
              :image-url="getImageUrl(img.thumbnail_path || img.image_path || img.main_path)"
              :image-id="img.id"
              :display-name="img.title || t('master_data.media.default_product_title')"
              @click="((isLightboxOpen = true), (lightboxIndex = index))"
            >
              <template #badges>
                <div
                  v-if="img.is_primary"
                  class="absolute top-2 left-2 bg-primary text-background text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-10 flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-star" /> {{ t('master_data.media.badge_primary') }}
                </div>
              </template>

              <template #actions>
                <MediaActionBar :image-url="getImageUrl(img.image_path || img.main_path)" :filename="img.title">
                  <button
                    v-if="!img.is_primary && canUpload"
                    @click.stop="setPrimary(img.id)"
                    :disabled="loading"
                    class="px-2 py-1 md:py-3 align-center items-center justify-center rounded-md bg-accent text-background hover:backdrop-brightness-75 transition-transform hover:scale-110 shadow-md"
                    :title="t('master_data.media.set_primary_title')"
                  >
                    <font-awesome-icon icon="fa-solid fa-star" />
                  </button>
                  <button
                    v-if="canDelete"
                    @click.stop="deleteImage(img.id)"
                    :disabled="loading"
                    class="px-2 py-1 md:py-3 align-center items-center justify-center rounded-md bg-danger text-background hover:backdrop-brightness-75 transition-transform hover:scale-110 shadow-md"
                    :title="t('master_data.media.delete_image_title')"
                  >
                    <font-awesome-icon icon="fa-solid fa-trash" />
                  </button>
                </MediaActionBar>
              </template>
            </MediaCard>
          </div>
        </div>
        <div v-if="canUpload" class="border-t border-secondary/10 pt-6">
          <div class="flex justify-between items-center mb-3">
            <h4 class="font-bold text-text/80 text-sm uppercase tracking-wide">{{ t('master_data.media.upload_new') }}</h4>
            <button
              v-if="selectedImages.length > 0"
              @click="autoCropAll"
              :disabled="autoCropAllProcessing"
              class="px-3 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-2 font-medium"
            >
              <font-awesome-icon v-if="autoCropAllProcessing" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-crop-simple" />
              {{ t('master_data.media.auto_crop_all') }}
            </button>
          </div>
          <div class="flex flex-col sm:flex-row gap-4">
            <label
              class="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-primary/30 rounded-xl cursor-pointer bg-primary/5 hover:bg-primary/10 transition-colors group"
            >
              <div
                class="flex flex-col items-center justify-center pt-5 pb-6 text-primary group-hover:scale-105 transition-transform text-center px-4"
              >
                <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-3xl mb-2" />
                <p class="text-sm font-bold">{{ t('master_data.media.upload_new') }}</p>
                <p class="text-[10px] opacity-70">
                  {{ t('master_data.media.upload_drop_hint') }}
                </p>
              </div>
              <!-- Input Multiple -->
              <input
                type="file"
                @change="handleImageUpload"
                accept="image/*"
                class="hidden"
                multiple
                :disabled="loading"
              />
            </label>
            <div
              @click="isMediaPickerOpen = true"
              class="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-primary/30 rounded-xl cursor-pointer bg-primary/5 hover:bg-primary/10 transition-colors group"
            >
              <div
                class="flex flex-col items-center justify-center pt-5 pb-6 text-primary group-hover:scale-105 transition-transform text-center px-4"
              >
                <font-awesome-icon icon="fa-solid fa-images" class="text-3xl mb-2" />
                <p class="text-sm font-bold">{{ t('master_data.media.from_gallery') }}</p>
                <p class="text-[10px] opacity-70">
                  {{ t('master_data.media.pick_existing_hint') }}
                </p>
              </div>
            </div>
            <div v-if="selectedImages.length > 0" class="flex flex-col gap-3 animate-slide-up">
              <!-- File Item List with Title Edit -->
              <div class="flex flex-col gap-2">
                <div
                  v-for="(file, idx) in selectedImages"
                  :key="idx"
                  class="flex flex-col md:flex-row gap-3 items-start md:items-center p-3 bg-secondary/5 rounded-lg border border-secondary/20 hover:border-primary/30 transition-colors"
                >
                  <!-- Thumbnail & Base actions -->
                  <div class="flex items-center gap-3 w-full md:w-auto shrink-0">
                    <div
                      class="relative w-16 h-16 rounded overflow-hidden bg-background border border-secondary/10 group"
                    >
                      <img :src="file.preview" class="w-full h-full object-cover" />
                      <div
                        class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 backdrop-blur-[2px]"
                      >
                        <button
                          @click.prevent="openCropper(idx)"
                          class="w-6 h-6 rounded-full bg-primary text-background flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                          :title="t('master_data.media.crop_image')"
                        >
                          <font-awesome-icon icon="fa-solid fa-crop-simple" class="text-[10px]" />
                        </button>
                      </div>
                    </div>
                    <div class="flex flex-col flex-1 min-w-0">
                      <span class="text-xs font-bold text-text truncate" :title="file.name">{{ file.name }}</span>
                      <span class="text-[10px] text-text/50">{{ (file.size / 1024).toFixed(1) }} KB</span>
                    </div>
                  </div>

                  <!-- Title Input & Delete -->
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
                        :placeholder="t('master_data.media.edit_title_placeholder')"
                      />
                    </div>
                    <button
                      @click.prevent="removeSelectedImage(idx)"
                      class="shrink-0 w-8 h-8 rounded-full bg-danger/10 text-danger flex items-center justify-center hover:bg-danger hover:text-white transition-colors"
                      :title="t('master_data.media.cancel_upload')"
                    >
                      <font-awesome-icon icon="fa-solid fa-times" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Bulk Tags -->
              <div class="mt-2 flex items-center gap-3">
                <font-awesome-icon icon="fa-solid fa-tags" class="text-primary/50" />
                <input
                  type="text"
                  v-model="uploadTagsStr"
                  class="flex-1 bg-background border border-secondary/20 rounded px-3 py-1.5 text-xs text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  :placeholder="t('master_data.media.tags_placeholder')"
                />
              </div>

              <div class="flex justify-end gap-3 mt-4 border-t border-secondary/10 pt-4">
                <button
                  @click="((selectedImages = []), (fileTitles = []))"
                  class="px-4 py-2 text-text/60 font-bold hover:bg-secondary/10 rounded-lg text-sm transition-colors"
                >
                  {{ t('common.btn.cancel') }}
                </button>
                <button
                  @click="saveNewImages"
                  :disabled="loading"
                  class="px-6 py-2 bg-primary hover:bg-primary-dark text-secondary font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all active:scale-95"
                >
                  <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin" />
                  <span v-else>{{ t('common.btn.save') }} ({{ selectedImages.length }})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
  <MediaLightbox
    :show="isLightboxOpen"
    :images="lightboxImages"
    :initialIndex="lightboxIndex"
    @close="isLightboxOpen = false"
  />

  <ImageCropperModal
    :show="isCropperOpen"
    :file="currentEditFile"
    @close="((isCropperOpen = false), (currentEditIndex = -1), (currentEditFile = null))"
    @save="handleCroppedSave"
  />

  <MediaPickerModal
    :show="isMediaPickerOpen"
    @close="isMediaPickerOpen = false"
    @select="handleMediaSelect"
  />
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
