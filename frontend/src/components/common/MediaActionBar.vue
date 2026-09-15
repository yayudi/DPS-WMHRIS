<script setup>
import { useImageActions } from '@/composables/useImageActions'

defineProps({
  imageUrl: { type: String, default: null },
  filename: { type: String, default: null },
  showInfo: { type: Boolean, default: false },
  showDelete: { type: Boolean, default: false },
  disableDelete: { type: Boolean, default: false }
})

defineEmits(['info', 'delete'])

const { copyLinkToClipboard, copyImageToClipboard, downloadImage } = useImageActions()
</script>
<template>
  <div class="grid grid-cols-3 items-center justify-center flex-wrap gap-1">
    <button
      v-if="showDelete"
      @click.stop="$emit('delete')"
      class="p-1 md:px-4 md:py-3 items-center justify-center rounded-md md:text-base lg:text-lg xl:text-xl bg-danger/20 border border-danger hover:bg-danger text-danger hover:text-background hover:backdrop-brightness-75 transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Hapus Media"
      :disabled="disableDelete"
    >
      <font-awesome-icon icon="fa-solid fa-trash" class="text-xs" />
    </button>
    <button
      v-if="showInfo"
      @click.stop="$emit('info')"
      class="p-1 md:px-4 md:py-3 items-center justify-center rounded-md md:text-base lg:text-lg xl:text-xl bg-accent/20 border border-accent hover:bg-accent text-accent hover:text-background hover:backdrop-brightness-75 transition-transform hover:scale-110"
      title="Info & Editor Tag"
    >
      <font-awesome-icon icon="fa-solid fa-tags" class="text-xs" />
    </button>
    <button
      v-if="imageUrl"
      @click.stop="downloadImage(imageUrl, filename)"
      class="p-1 md:px-4 md:py-3 items-center justify-center rounded-md md:text-base lg:text-lg xl:text-xl bg-primary/20 border border-primary hover:bg-primary text-primary hover:text-background hover:backdrop-brightness-75 transition-transform hover:scale-110"
      title="Unduh Gambar"
    >
      <font-awesome-icon icon="fa-solid fa-download" class="text-xs" />
    </button>
    <button
      v-if="imageUrl"
      @click.stop="copyLinkToClipboard(imageUrl)"
      class="p-1 md:px-4 md:py-3 items-center justify-center rounded-md md:text-base lg:text-lg xl:text-xl bg-success/20 border border-success hover:bg-success text-success hover:text-background hover:backdrop-brightness-75 transition-transform hover:scale-110"
      title="Salin Tautan"
    >
      <font-awesome-icon icon="fa-solid fa-link" class="text-xs" />
    </button>
    <button
      v-if="imageUrl"
      @click.stop="copyImageToClipboard(imageUrl)"
      class="p-1 md:px-4 md:py-3 items-center justify-center rounded-md md:text-base lg:text-lg xl:text-xl bg-warning/20 border border-warning hover:bg-warning text-warning hover:text-background hover:backdrop-brightness-75 transition-transform hover:scale-110"
      title="Salin Gambar"
    >
      <font-awesome-icon icon="fa-solid fa-copy" class="text-xs" />
    </button>
    <!-- Extra actions from parent -->
    <slot />
  </div>
</template>
