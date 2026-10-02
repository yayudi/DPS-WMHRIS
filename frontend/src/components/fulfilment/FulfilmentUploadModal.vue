<script setup>
import { ref, onMounted } from 'vue'
import { uploadAndValidateFulfilment } from '@/api/helpers/fulfilment.js'
import { fetchAllLocations } from '@/api/helpers/locations.js'
import { fetchAllSalesChannels } from '@/api/helpers/salesChannels.js'
import { useToast } from '@/composables/useToast.js'
import BaseModal from '@/components/ui/BaseModal.vue'

defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close', 'uploaded'])

const { toast } = useToast()

const isLoading = ref(false)
const selectedPurpose = ref('DISPLAY')
const isDryRun = ref(false)
const files = ref([])
const notes = ref('')

const fileInput = ref(null)

const allChannels = ref([])

const sourceOptions = ref([
  { id: 'Tokopedia', label: 'Tokopedia / TikTok Shop' }
])

const purposeOptions = ref([
  { id: 'DISPLAY', label: 'DISPLAY' } // Default fallback
])

async function loadPurposes() {
  try {
    const locations = await fetchAllLocations()
    const uniquePurposes = [...new Set(locations.map(l => l.purpose).filter(Boolean))]
    
    if (uniquePurposes.length > 0) {
      purposeOptions.value = uniquePurposes.map(p => ({ id: p, label: p }))
      
      // Jika purpose default (DISPLAY) tidak ada di database, set ke purpose pertama yang ditemukan
      if (!uniquePurposes.includes(selectedPurpose.value)) {
        selectedPurpose.value = uniquePurposes[0]
      }
    }
  } catch (error) {
    console.error('Gagal mengambil data lokasi untuk dropdown purpose:', error)
  }
}

async function loadSources() {
  try {
    const channels = await fetchAllSalesChannels()
    // Hanya tampilkan yang aktif
    const activeChannels = channels.filter(c => c.is_active)
    allChannels.value = activeChannels
    
    if (activeChannels.length > 0) {
      const uniquePlatforms = [...new Set(activeChannels.map(c => c.platform).filter(Boolean))]
      
      sourceOptions.value = uniquePlatforms.map(p => ({ 
        id: p, 
        label: p 
      }))
    }
  } catch (error) {
    console.error('Gagal mengambil data sales channels untuk dropdown:', error)
  }
}

function getShopOptions(platform) {
  return allChannels.value
    .filter(c => c.platform === platform)
    .map(c => ({ id: c.name, label: c.name }))
}

function handleSourceChange(item) {
  const shops = getShopOptions(item.source)
  item.shopName = shops.length > 0 ? shops[0].id : ''
}

onMounted(() => {
  loadPurposes()
  loadSources()
})

function guessSourceAndShopFromName(fileName) {
  const lowerName = fileName.toLowerCase()
  
  // 1. Deteksi Source
  let detectedSource = sourceOptions.value.length > 0 ? sourceOptions.value[0].id : 'Tokopedia'
  const matchedSource = sourceOptions.value.find(opt => lowerName.includes(opt.id.toLowerCase()))
  
  if (matchedSource) {
    detectedSource = matchedSource.id
  } else if (lowerName.includes('tiktok')) {
    // Alias tiktok -> Tokopedia
    const topo = sourceOptions.value.find(opt => opt.id.toLowerCase() === 'tokopedia')
    if (topo) detectedSource = topo.id
  }
  
  // 2. Deteksi Shop Name
  const shops = getShopOptions(detectedSource)
  let detectedShopName = shops.length > 0 ? shops[0].id : ''
  
  const matchedShop = shops.find(shop => lowerName.includes(shop.id.toLowerCase()))
  if (matchedShop) {
    detectedShopName = matchedShop.id
  }

  return { source: detectedSource, shopName: detectedShopName }
}

function handleFileChange(event) {
  const selectedFiles = Array.from(event.target.files)
  
  const newFiles = selectedFiles.map(file => {
    const { source, shopName } = guessSourceAndShopFromName(file.name)
    return {
      raw: file,
      source: source,
      shopName: shopName
    }
  })
  
  files.value = [...files.value, ...newFiles]
}

function removeFile(index) {
  files.value.splice(index, 1)
}

function resetForm() {
  selectedPurpose.value = 'DISPLAY'
  isDryRun.value = false
  files.value = []
  notes.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

async function handleSubmit() {
  if (files.value.length === 0) {
    toast('Pilih minimal satu file untuk diunggah', 'warning')
    return
  }

  isLoading.value = true
  try {
    const formData = new FormData()
    files.value.forEach(item => formData.append('files', item.raw))
    
    formData.append('purpose', selectedPurpose.value)
    formData.append('dryRun', isDryRun.value)
    if (notes.value) formData.append('notes', notes.value)

    const sourcesArray = files.value.map(item => item.source)
    formData.append('sources', JSON.stringify(sourcesArray))

    const shopNamesArray = files.value.map(item => item.shopName)
    formData.append('shopNames', JSON.stringify(shopNamesArray))

    const res = await uploadAndValidateFulfilment(formData)

    if (res.success) {
      toast(res.message || 'File berhasil diunggah dan masuk antrean.', 'success')
      emit('uploaded', res.data?.jobIds)
      resetForm()
      emit('close')
    } else {
      toast(res.message || 'Gagal mengunggah file', 'error')
    }
  } catch (error) {
    toast(error.message || 'Terjadi kesalahan sistem saat mengunggah file', 'error')
  } finally {
    isLoading.value = false
  }
}

function closeModal() {
  resetForm()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <BaseModal :show="isOpen" @close="closeModal" title="Upload File Fulfilment" maxWidth="max-w-xl">
      <div class="space-y-4">
        <div class="bg-secondary/10 p-4 rounded-xl text-sm text-text/80">
          Silakan unggah file CSV atau Excel dari marketplace / sistem POS untuk memproses fulfilment. Sistem akan
          membuat
          <b>Background Job</b> untuk memvalidasi dan memproses file ini.
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold mb-1">Lokasi Stok (Purpose)</label>
            <select v-model="selectedPurpose" class="w-full bg-background border border-secondary/20 p-2.5 rounded-lg">
              <option v-for="opt in purposeOptions" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-semibold mb-1">Catatan Tambahan (Berlaku Semua)</label>
            <input
              v-model="notes"
              type="text"
              placeholder="Opsional"
              class="w-full bg-background border border-secondary/20 p-2.5 rounded-lg"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 bg-secondary/10 p-3 rounded-lg border border-secondary/20">
          <input id="dryRunCheck" type="checkbox" v-model="isDryRun" class="w-4 h-4 rounded" />
          <label for="dryRunCheck" class="text-sm cursor-pointer select-none">
            <b>Mode Simulasi (Dry Run)</b> - Hanya memvalidasi data tanpa menyimpan atau mengurangi stok.
          </label>
        </div>

        <div>
          <label class="block text-sm font-semibold mb-2">Pilih File (CSV / XLSX)</label>
          <div
            class="border-2 border-dashed border-secondary/30 rounded-xl p-6 text-center hover:bg-secondary/5 transition-colors"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              multiple
              class="hidden"
              id="fulfilmentFile"
              @change="handleFileChange"
            />
            <label for="fulfilmentFile" class="cursor-pointer text-primary font-semibold flex flex-col items-center">
              <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-3xl mb-2 text-text/50" />
              Klik untuk memilih file
            </label>
          </div>

          <ul v-if="files.length > 0" class="mt-4 space-y-3">
            <li
              v-for="(item, index) in files"
              :key="index"
              class="flex flex-col bg-secondary/10 px-4 py-3 rounded-xl gap-3 border border-secondary/20"
            >
              <div class="flex items-center justify-between border-b border-secondary/10 pb-2">
                <span class="truncate flex-1 font-semibold text-sm" :title="item.raw.name">
                  <font-awesome-icon icon="fa-solid fa-file-csv" class="mr-2 text-primary" />
                  {{ item.raw.name }}
                </span>
                <button @click="removeFile(index)" class="text-error hover:text-error/80 p-1 bg-background rounded-md">
                  <font-awesome-icon icon="fa-solid fa-trash-can" />
                </button>
              </div>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold mb-1 text-text/80">Sumber Pesanan</label>
                  <select v-model="item.source" @change="handleSourceChange(item)" class="w-full bg-background border border-secondary/30 p-2 text-sm rounded-lg">
                    <option v-for="opt in sourceOptions" :key="opt.id" :value="opt.id">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-semibold mb-1 text-text/80">Nama Toko (Opsional)</label>
                  <select v-if="getShopOptions(item.source).length > 0" v-model="item.shopName" class="w-full bg-background border border-secondary/30 p-2 text-sm rounded-lg">
                    <option value="">-- Pilih Toko --</option>
                    <option v-for="opt in getShopOptions(item.source)" :key="opt.id" :value="opt.id">
                      {{ opt.label }}
                    </option>
                  </select>
                  <input
                    v-else
                    v-model="item.shopName"
                    type="text"
                    placeholder="Ketik manual..."
                    class="w-full bg-background border border-secondary/30 p-2 text-sm rounded-lg"
                  />
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <button
            @click="closeModal"
            :disabled="isLoading"
            class="px-5 py-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors"
          >
            Batal
          </button>
          <button
            @click="handleSubmit"
            :disabled="isLoading || files.length === 0"
            class="px-5 py-2.5 rounded-lg bg-primary text-secondary font-bold hover:brightness-110 flex items-center justify-center min-w-[120px] transition-all disabled:opacity-60"
          >
            <font-awesome-icon v-if="isLoading" icon="fa-solid fa-circle-notch" class="animate-spin mr-2" />
            {{ isLoading ? 'Mengunggah...' : 'Unggah & Proses' }}
          </button>
        </div>
      </template>
    </BaseModal>
  </Teleport>
</template>
