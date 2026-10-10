<script setup>
import { useBrokenImages } from '@/composables/useImageUrl'
import { useMobile } from '@/composables/useMobile'

const { isMobile } = useMobile()

defineProps({
  /** Full resolved image URL */
  imageUrl: { type: String, default: null },
  /** Unique identifier for broken-image tracking */
  imageId: { type: [Number, String], required: true },
  /** Display name shown on hover overlay */
  displayName: { type: String, default: 'Gambar' },
  /** Processing status: 'COMPLETED' | 'PENDING' | 'PROCESSING' | 'FAILED' */
  status: { type: String, default: 'COMPLETED' },
  /** Whether the card is in a selected state */
  selected: { type: Boolean, default: false },
  /** Whether to show the bulk-select checkbox indicator */
  selectable: { type: Boolean, default: false },
  /** Whether to show the hover overlay with actions */
  showOverlay: { type: Boolean, default: true }
})

defineEmits(['click'])

const { brokenImages, onImgError } = useBrokenImages()
</script>

<template>
  <div
    class="group flex flex-col border-secondary/20 bg-background rounded-xl border overflow-hidden shadow-sm hover:shadow-lg hover:border-primary transition-all relative"
    :class="[!isMobile ? 'aspect-square h-full' : 'h-full']"
    @click="$emit('click')"
  >
    <!-- Area Gambar -->
    <figure class="relative w-full bg-secondary/10 shrink-0" :class="!isMobile ? 'h-full' : 'aspect-square'">
      <!-- Bulk Checkbox Indicator -->
      <div v-if="selectable" class="absolute top-2 left-2 z-20 pointer-events-none">
        <div
          class="h-6 w-6 rounded border-2 flex items-center justify-center transition-colors"
          :class="
            selected
              ? 'bg-primary border-primary text-background'
              : 'bg-background/80 border-secondary text-transparent'
          "
        >
          <font-awesome-icon icon="fa-solid fa-check" class="text-sm" />
        </div>
      </div>

      <!-- Image / Fallback / Processing -->
      <img
        v-if="status === 'COMPLETED' && imageUrl && !brokenImages.has(imageId)"
        :src="imageUrl"
        :alt="displayName"
        class="w-full h-full object-cover"
        @error="onImgError(imageId)"
      />

      <div
        v-else-if="status === 'COMPLETED'"
        class="w-full h-full flex flex-col items-center justify-center text-text/20"
      >
        <font-awesome-icon icon="fa-solid fa-image" class="text-4xl mb-1" />
        <span class="text-[10px] font-medium">No Image</span>
      </div>

      <div v-else class="flex flex-col items-center justify-center w-full h-full opacity-60 text-text">
        <font-awesome-icon
          v-if="status === 'PENDING' || status === 'PROCESSING'"
          icon="fa-solid fa-spinner"
          spin
          class="text-primary text-2xl"
        />
        <font-awesome-icon v-else icon="fa-solid fa-triangle-exclamation" class="text-danger text-2xl" />
        <span class="text-xs font-semibold mt-2">{{ status }}</span>
      </div>

      <!-- Badges slot (primary badge, usage count, dll) -->
      <slot name="badges" />
    </figure>

    <!-- Area Info & Kontrol -->
    <div
      v-if="showOverlay"
      class="flex flex-col gap-2 transition-all duration-300"
      :class="
        !isMobile
          ? 'absolute inset-0 bg-background/80 backdrop-blur-sm items-center justify-center p-2 text-center z-10 opacity-0 group-hover:opacity-100'
          : 'flex-1 pt-2 bg-secondary/5 border-t border-secondary/10 justify-between'
      "
    >
      <!-- Judul File -->
      <span
        class="font-medium truncate w-full text-center block"
        :class="!isMobile ? 'text-xs text-text mb-2 px-2' : 'text-xs sm:text-sm text-text'"
        :title="displayName"
      >
        {{ displayName }}
      </span>

      <!-- Actions slot -->
      <div class="flex justify-center w-full">
        <slot name="actions" />
      </div>

      <!-- Footer slot (tags, info tambahan) -->
      <div class="flex justify-center w-full">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
