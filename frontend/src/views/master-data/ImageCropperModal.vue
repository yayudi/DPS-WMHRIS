<script setup>
import { ref, onUnmounted, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import 'cropperjs' // This auto-registers the web components (e.g. <cropper-canvas>)
import BaseModal from '@/components/ui/BaseModal.vue'

const props = defineProps({
  show: Boolean,
  file: File,
})

const emit = defineEmits(['close', 'save'])

const cropperKey = ref(0)
const cropperImage = ref(null)
const cropperSelection = ref(null)
const imageObjectUrl = ref('')
const isProcessing = ref(false)
const aspectRatio = ref(1)
const isRatioDropdownOpen = ref(false)
const dropdownBtnRef = ref(null)
const dropdownRef = ref(null)
const isModalReady = ref(false)

const { floatingStyles } = useFloating(dropdownBtnRef, dropdownRef, {
  placement: 'top-start',
  middleware: [offset(8), flip(), shift({ padding: 10 })],
  whileElementsMounted: autoUpdate
})

onClickOutside(
  dropdownRef,
  (event) => {
    if (dropdownBtnRef.value && dropdownBtnRef.value.contains(event.target)) return
    closeRatioDropdown()
  },
  { ignore: [dropdownBtnRef] }
)

watch(
  () => props.show,
  async (newVal) => {
    if (newVal && props.file) {
      imageObjectUrl.value = URL.createObjectURL(props.file)
      setTimeout(() => {
        isModalReady.value = true
      }, 300)
    } else {
      isModalReady.value = false
      if (imageObjectUrl.value) {
        URL.revokeObjectURL(imageObjectUrl.value)
        imageObjectUrl.value = ''
      }
    }
    console.log(cropperKey.value)
  },
)

onUnmounted(() => {
  if (imageObjectUrl.value) URL.revokeObjectURL(imageObjectUrl.value)
})

const rotateLeft = () => {
  if (cropperImage.value) cropperImage.value.$rotate('-90deg')
}

const rotateRight = () => {
  if (cropperImage.value) cropperImage.value.$rotate('90deg')
}

const flipHorizontal = () => {
  if (cropperImage.value) cropperImage.value.$scale(-1, 1)
}

const flipVertical = () => {
  if (cropperImage.value) cropperImage.value.$scale(1, -1)
}

const setAspectRatio = (ratio) => {
  aspectRatio.value = isNaN(ratio) ? undefined : ratio
  if (cropperSelection.value) {
    // Modify the Web Component property directly
    cropperSelection.value.aspectRatio = isNaN(ratio) ? NaN : ratio
    cropperSelection.value.$reset() // Snap back to center with the new ratio
  }
  closeRatioDropdown()
}

const toggleRatioDropdown = () => {
  isRatioDropdownOpen.value = !isRatioDropdownOpen.value
}

const closeRatioDropdown = () => {
  isRatioDropdownOpen.value = false
}

const reset = () => {
  cropperKey.value += 1
}

const save = async () => {
  if (!cropperSelection.value) return
  isProcessing.value = true

  try {
    const canvas = await cropperSelection.value.$toCanvas()

    if (!canvas) {
      isProcessing.value = false
      return
    }

    // Convert canvas to blob and then to File
    canvas.toBlob(
      (blob) => {
        if (blob) {
          // Create a new File object with the same name and type
          const newFile = new File([blob], props.file.name, {
            type: props.file.type,
            lastModified: Date.now(),
          })
          emit('save', newFile)
          closeModal()
        }
        isProcessing.value = false
      },
      props.file.type,
      0.95,
    )
  } catch (err) {
    console.error('Cropping failed', err)
    isProcessing.value = false
  }
}

const closeModal = () => {
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="closeModal" maxWidth="max-w-4xl">
    <template #title>
      <div class="flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-crop-simple" class="text-primary" />
        Edit Gambar
      </div>
    </template>

    <!-- Cropper Container -->
    <div
      class="w-full bg-black/10 overflow-hidden relative h-[50vh] min-h-[400px] rounded-xl border border-secondary/20 flex items-center justify-center"
    >
      <div v-if="!isModalReady" class="text-text/50 flex flex-col items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-spinner" spin class="text-2xl text-primary" />
        <span class="text-sm">Menyiapkan editor...</span>
      </div>
      <cropper-canvas
        v-if="isModalReady"
        :key="cropperKey"
        background
        class="w-full h-full block fade-in"
      >
        <cropper-image
          ref="cropperImage"
          :src="imageObjectUrl"
          alt="Picture"
          rotatable
          scalable
        ></cropper-image>
        <cropper-shade hidden></cropper-shade>
        <cropper-handle action="select" plain></cropper-handle>
        <cropper-selection
          :aspect-ratio="aspectRatio"
          initial-coverage="1"
          movable
          resizable
          ref="cropperSelection"
        >
          <cropper-grid role="grid" covered></cropper-grid>
          <cropper-crosshair centered></cropper-crosshair>
          <cropper-handle action="move" theme-color="rgba(0,0,0,0)"></cropper-handle>
          <cropper-handle action="n-resize"></cropper-handle>
          <cropper-handle action="e-resize"></cropper-handle>
          <cropper-handle action="s-resize"></cropper-handle>
          <cropper-handle action="w-resize"></cropper-handle>
          <cropper-handle action="ne-resize"></cropper-handle>
          <cropper-handle action="nw-resize"></cropper-handle>
          <cropper-handle action="se-resize"></cropper-handle>
          <cropper-handle action="sw-resize"></cropper-handle>
        </cropper-selection>
      </cropper-canvas>
    </div>

    <!-- Footer & Controls -->
    <template #footer>
      <div class="w-full flex flex-wrap gap-4 items-center justify-between">
        <!-- Tool Buttons -->
        <div class="flex gap-2">
          <button
            @click="rotateLeft"
            class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all flex items-center gap-2"
            title="Putar Kiri"
          >
            <font-awesome-icon icon="fa-solid fa-rotate-left" />
          </button>
          <button
            @click="rotateRight"
            class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all flex items-center gap-2"
            title="Putar Kanan"
          >
            <font-awesome-icon icon="fa-solid fa-rotate-right" />
          </button>
          <button
            @click="flipHorizontal"
            class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all flex items-center gap-2"
            title="Flip Horizontal"
          >
            <font-awesome-icon icon="fa-solid fa-arrows-left-right" />
          </button>
          <button
            @click="flipVertical"
            class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all flex items-center gap-2"
            title="Flip Vertical"
          >
            <font-awesome-icon icon="fa-solid fa-arrows-up-down" />
          </button>
          <!-- Manual Teleported Dropdown -->
          <div class="relative">
            <button
              ref="dropdownBtnRef"
              @click="toggleRatioDropdown"
              class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all flex items-center gap-2"
              title="Aspect Ratio"
            >
              <font-awesome-icon icon="fa-solid fa-expand" /> Rasio
            </button>

            <Teleport to="body">
              <ul
                v-if="isRatioDropdownOpen"
                ref="dropdownRef"
                :style="floatingStyles"
                class="menu p-2 shadow-2xl bg-background rounded-xl w-44 border border-secondary shadow-black/50 z-[99999] absolute"
              >
                <li>
                  <a
                    @click="setAspectRatio(NaN)"
                    :class="{ 'bg-primary/20 text-primary font-bold': aspectRatio === undefined }"
                    >Bebas</a
                  >
                </li>
                <li>
                  <a
                    @click="setAspectRatio(1)"
                    :class="{ 'bg-primary/20 text-primary font-bold': aspectRatio === 1 }"
                    >1:1</a
                  >
                </li>
                <li>
                  <a
                    @click="setAspectRatio(4 / 3)"
                    :class="{ 'bg-primary/20 text-primary font-bold': aspectRatio === 4 / 3 }"
                    >4:3</a
                  >
                </li>
                <li>
                  <a
                    @click="setAspectRatio(16 / 9)"
                    :class="{ 'bg-primary/20 text-primary font-bold': aspectRatio === 16 / 9 }"
                    >16:9</a
                  >
                </li>
              </ul>
            </Teleport>
          </div>
          <button
            @click="reset"
            class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all flex items-center gap-2"
            title="Reset"
          >
            <font-awesome-icon icon="fa-solid fa-arrow-rotate-left" /> Reset
          </button>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <button
            @click="closeModal"
            class="px-4 py-2 rounded-lg text-text hover:bg-secondary transition-colors"
            :disabled="isProcessing"
          >
            Batal
          </button>
          <button
            @click="save"
            class="px-6 py-2 rounded-lg bg-primary text-background font-bold hover:bg-accent transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
            :disabled="isProcessing"
          >
            <font-awesome-icon v-if="isProcessing" icon="fa-solid fa-spinner" spin />
            <font-awesome-icon v-else icon="fa-solid fa-check" />
            Simpan Perubahan
          </button>
        </div>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* Scoped styles are optional here as Cropper Canvas is a web component with its own styles */
cropper-canvas {
  height: 100%;
}
</style>
