<script setup>
import { ref, watch, computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import api from '@/api/axios'
import { useToast } from '@/composables/useToast'
import { swalConfirm, swalAlert } from '@/composables/useSweetAlert'

const props = defineProps({
  show: { type: Boolean, required: true }
})
const emit = defineEmits(['close', 'updated'])
const { toast } = useToast()

const paperSizes = ref([])
const isLoading = ref(false)
const showForm = ref(false)

const formData = ref({
  id: null,
  name: '',
  topMargin: 0,
  sideMargin: 0,
  verticalPitch: 0,
  horizontalPitch: 0,
  labelHeight: 0,
  labelWidth: 0,
  numberAcross: 1,
  numberDown: 1,
  pageWidth: 0,
  pageHeight: 0
})

const fetchPaperSizes = async () => {
  isLoading.value = true
  try {
    const res = await api.get('/paper-sizes')
    if (res.data.success) {
      paperSizes.value = res.data.data
    }
  } catch (error) {
    console.error(error)
    toast('Gagal memuat ukuran kertas', 'error')
  } finally {
    isLoading.value = false
  }
}
watch(() => props.show, (newVal) => {
  if (newVal && paperSizes.value.length === 0) {
    fetchPaperSizes()
  }
}, { immediate: true })

const openAddForm = () => {
  formData.value = {
    id: null,
    name: '',
    topMargin: 0,
    sideMargin: 0,
    verticalPitch: 40,
    horizontalPitch: 80,
    labelHeight: 40,
    labelWidth: 80,
    numberAcross: 1,
    numberDown: 1,
    pageWidth: 80,
    pageHeight: 40
  }
  showForm.value = true
}

const editPaperSize = item => {
  formData.value = { ...item }
  showForm.value = true
}

const deletePaperSize = async id => {
  const confirmed = await swalConfirm('Yakin ingin menghapus ukuran kertas ini?')
  if (!confirmed) return

  try {
    const res = await api.delete(`/paper-sizes/${id}`)
    if (res.data.success) {
      toast('Ukuran kertas dihapus', 'success')
      fetchPaperSizes()
      emit('updated')
    }
  } catch (error) {
    console.error(error)
    swalAlert(error.response?.data?.message || 'Gagal menghapus ukuran kertas')
  }
}

const submitForm = async () => {
  if (
    !formData.value.name ||
    !formData.value.labelWidth ||
    !formData.value.labelHeight ||
    !formData.value.pageWidth ||
    !formData.value.pageHeight
  ) {
    toast('Nama, Label Size, dan Page Size wajib diisi', 'warning')
    return
  }

  try {
    let res
    if (formData.value.id) {
      res = await api.put(`/paper-sizes/${formData.value.id}`, formData.value)
    } else {
      res = await api.post('/paper-sizes', formData.value)
    }

    if (res.data.success) {
      toast('Ukuran kertas berhasil disimpan', 'success')
      showForm.value = false
      fetchPaperSizes()
      emit('updated')
    }
  } catch (error) {
    console.error(error)
    swalAlert(error.response?.data?.message || 'Gagal menyimpan ukuran kertas')
  }
}

const previewScale = computed(() => {
  const maxDim = Math.max(formData.value.pageWidth || 1, formData.value.pageHeight || 1)
  // Fit within a 280px box
  return 280 / maxDim
})
</script>

<template>
  <transition name="modal-fade">
    <div v-if="show" class="fixed inset-0 z-[110] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')"></div>

      <div
        class="bg-secondary w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl relative flex flex-col border border-secondary/20 z-10 m-4"
      >
        <!-- Header -->
        <div
          class="p-5 border-b border-primary/10 flex justify-between items-center bg-background/50 rounded-t-2xl shrink-0"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <font-awesome-icon icon="fa-solid fa-ruler-combined" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-text">Kelola Label & Ukuran Kertas</h3>
              <p class="text-sm text-text/60">Pengaturan presisi layout label untuk pencetakan (dalam milimeter)</p>
            </div>
          </div>
          <button
            @click="$emit('close')"
            class="text-text/50 hover:text-accent transition-colors w-8 h-8 rounded-full hover:bg-accent/10 flex items-center justify-center"
          >
            <font-awesome-icon icon="fa-solid fa-times" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
          <!-- Form Mode -->
          <div v-if="showForm" class="flex flex-col lg:flex-row gap-6">
            <!-- Left: Inputs -->
            <div class="flex-1 space-y-4">
              <div class="space-y-1">
                <label class="text-sm font-bold text-text/70">Label Name</label>
                <input
                  v-model="formData.name"
                  type="text"
                  class="w-full bg-background border border-primary/20 rounded-lg px-4 py-2 text-text focus:outline-none focus:border-primary"
                  placeholder="Contoh: A4 Label (3x7)"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Side Margin (mm)</label>
                  <input
                    v-model.number="formData.sideMargin"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Top Margin (mm)</label>
                  <input
                    v-model.number="formData.topMargin"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Horizontal Pitch (mm)</label>
                  <input
                    v-model.number="formData.horizontalPitch"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                    title="Jarak dari kiri label 1 ke kiri label di kanannya"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Vertical Pitch (mm)</label>
                  <input
                    v-model.number="formData.verticalPitch"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                    title="Jarak dari atas label 1 ke atas label di bawahnya"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Label Width (mm)</label>
                  <input
                    v-model.number="formData.labelWidth"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Label Height (mm)</label>
                  <input
                    v-model.number="formData.labelHeight"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Number Across</label>
                  <input
                    v-model.number="formData.numberAcross"
                    type="number"
                    step="1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                    title="Jumlah kolom label"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Number Down</label>
                  <input
                    v-model.number="formData.numberDown"
                    type="number"
                    step="1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                    title="Jumlah baris label"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Page Width (mm)</label>
                  <input
                    v-model.number="formData.pageWidth"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-sm font-bold text-text/70">Page Height (mm)</label>
                  <input
                    v-model.number="formData.pageHeight"
                    type="number"
                    step="0.1"
                    class="w-full bg-background border border-primary/20 rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <!-- Right: Live Preview -->
            <div class="w-full lg:w-[350px] shrink-0 flex flex-col gap-4">
              <div class="bg-background rounded-xl border border-primary/20 p-4 flex flex-col h-full">
                <h4 class="font-bold text-text/80 text-sm mb-4 text-center">Live Preview</h4>
                <div
                  class="flex-1 w-full bg-gray-200/50 dark:bg-gray-800/50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-300 dark:border-gray-700 min-h-[300px]"
                >
                  <!-- The virtual Page -->
                  <div
                    class="bg-white shadow-sm relative overflow-hidden"
                    :style="{
                      width: formData.pageWidth + 'px',
                      height: formData.pageHeight + 'px',
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'center center'
                    }"
                  >
                    <!-- Render each label block -->
                    <template v-for="r in formData.numberDown || 1" :key="'r' + r">
                      <template v-for="c in formData.numberAcross || 1" :key="'c' + c">
                        <div
                          class="absolute bg-primary/20 border border-primary flex items-center justify-center"
                          :style="{
                            width: formData.labelWidth + 'px',
                            height: formData.labelHeight + 'px',
                            top: formData.topMargin + (r - 1) * formData.verticalPitch + 'px',
                            left: formData.sideMargin + (c - 1) * formData.horizontalPitch + 'px'
                          }"
                        >
                          <span
                            v-if="formData.numberAcross <= 5 && formData.numberDown <= 10"
                            class="text-[6px] text-primary font-bold opacity-50 select-none"
                            >Label</span
                          >
                        </div>
                      </template>
                    </template>
                  </div>
                </div>
                <div class="text-xs text-text/50 mt-3 text-center">
                  Preview berskala proporsional. Harap pastikan margin dan pitch tidak membuat label keluar dari kertas.
                </div>
              </div>

              <div class="flex justify-end gap-3 mt-auto">
                <button
                  @click="showForm = false"
                  class="px-5 py-2 rounded-xl font-bold text-text bg-secondary border border-primary/20 hover:bg-background transition-colors"
                >
                  Batal
                </button>
                <button
                  @click="submitForm"
                  class="px-5 py-2 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>

          <!-- List Mode -->
          <div v-else>
            <div class="flex justify-between items-center mb-6">
              <h4 class="font-bold text-text">Daftar Label Tersimpan</h4>
              <button
                @click="openAddForm"
                class="text-xs px-4 py-2 bg-primary/10 text-primary rounded-xl font-bold hover:bg-primary hover:text-white transition-colors flex items-center gap-2"
              >
                <font-awesome-icon icon="fa-solid fa-plus" /> Buat Template Label
              </button>
            </div>

            <div v-if="isLoading" class="text-center py-12 text-text/50">
              <font-awesome-icon icon="fa-solid fa-circle-notch" class="fa-spin text-2xl text-primary mb-3" />
              <div>Memuat data...</div>
            </div>

            <div
              v-else-if="paperSizes.length === 0"
              class="text-center py-12 text-text/50 border-2 border-dashed border-primary/20 rounded-2xl"
            >
              Belum ada ukuran kertas yang disimpan.
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="item in paperSizes"
                :key="item.id"
                class="p-5 bg-background border border-primary/20 rounded-2xl relative group hover:border-primary/50 transition-colors"
              >
                <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    @click="editPaperSize(item)"
                    class="w-8 h-8 rounded-lg bg-accent/10 text-accent hover:bg-accent hover:text-white flex items-center justify-center transition-colors shadow-sm"
                  >
                    <font-awesome-icon icon="fa-solid fa-pen" class="text-xs" />
                  </button>
                  <button
                    @click="deletePaperSize(item.id)"
                    class="w-8 h-8 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-white flex items-center justify-center transition-colors shadow-sm"
                  >
                    <font-awesome-icon icon="fa-solid fa-trash" class="text-xs" />
                  </button>
                </div>

                <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <font-awesome-icon
                    :icon="item.numberAcross > 1 ? 'fa-solid fa-border-all' : 'fa-solid fa-receipt'"
                    class="text-lg"
                  />
                </div>

                <div class="font-bold text-text text-lg pr-16 mb-1">{{ item.name }}</div>

                <div class="space-y-1.5 mt-4 text-sm">
                  <div class="flex justify-between border-b border-primary/10 pb-1">
                    <span class="text-text/60">Page Size:</span>
                    <span class="font-mono font-medium text-text">{{ item.pageWidth }} × {{ item.pageHeight }} mm</span>
                  </div>
                  <div class="flex justify-between border-b border-primary/10 pb-1">
                    <span class="text-text/60">Label Size:</span>
                    <span class="font-mono font-medium text-text"
                      >{{ item.labelWidth }} × {{ item.labelHeight }} mm</span
                    >
                  </div>
                  <div class="flex justify-between pb-1">
                    <span class="text-text/60">Layout:</span>
                    <span class="font-medium text-text"
                      >{{ item.numberAcross }} Across, {{ item.numberDown }} Down</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
