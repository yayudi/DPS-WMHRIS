<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { formatBytes } from '@/utils/formatBytes';
import { resolveUrl } from '@/composables/useImageUrl';

const props = defineProps({
  show: Boolean,
  images: Array,
  initialIndex: Number
});

const emit = defineEmits(['close']);

const currentIndex = ref(0);
const imgBroken = ref(false);

// resolveUrl now comes from useImageUrl composable

const handleKeydown = (e) => {
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    currentIndex.value = props.initialIndex || 0;
    imgBroken.value = false;
    window.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden'; // prevent scroll behind
  } else {
    window.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
  }
});

const close = () => {
  emit('close');
};

const next = () => {
  if (!props.images || props.images.length === 0) return;
  imgBroken.value = false;
  if (currentIndex.value < props.images.length - 1) {
    currentIndex.value++;
  } else {
    currentIndex.value = 0; // wrap around
  }
};

const prev = () => {
  if (!props.images || props.images.length === 0) return;
  imgBroken.value = false;
  if (currentIndex.value > 0) {
    currentIndex.value--;
  } else {
    currentIndex.value = props.images.length - 1; // wrap around
  }
};

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <div v-if="show"
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md transition-opacity duration-300"
    @click.self="close">

    <!-- Top Bar Close Button -->
    <button @click="close"
      class="absolute top-4 right-4 w-12 h-12 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-white hover:text-black transition-colors"
      title="Close (Esc)">
      <font-awesome-icon icon="fa-solid fa-times" class="text-xl" />
    </button>

    <!-- Left Navigation -->
    <button v-if="images.length > 1" @click.stop="prev"
      class="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center text-white bg-black/50 hover:bg-white/20 rounded-full transition-colors opacity-70 hover:opacity-100 z-10"
      title="Previous (Arrow Left)">
      <font-awesome-icon icon="fa-solid fa-chevron-left" class="text-2xl" />
    </button>

    <!-- Right Navigation -->
    <button v-if="images.length > 1" @click.stop="next"
      class="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center text-white bg-black/50 hover:bg-white/20 rounded-full transition-colors opacity-70 hover:opacity-100 z-10"
      title="Next (Arrow Right)">
      <font-awesome-icon icon="fa-solid fa-chevron-right" class="text-2xl" />
    </button>

    <!-- Image Container -->
    <div
      class="relative w-full h-full max-w-[90vw] max-h-[90vh] flex flex-col items-center justify-center pointer-events-none px-12 pb-16">
      <template v-if="images[currentIndex]">
        <img v-if="resolveUrl(images[currentIndex].main_path || images[currentIndex].thumbnail_path) && !imgBroken"
          :src="resolveUrl(images[currentIndex].main_path || images[currentIndex].thumbnail_path)"
          class="max-h-full max-w-full object-contain pointer-events-auto rounded shadow-2xl transition-transform duration-300"
          :alt="images[currentIndex].title" @error="imgBroken = true" />
        <div v-else class="w-64 h-64 flex flex-col items-center justify-center text-white/30 pointer-events-auto">
          <font-awesome-icon icon="fa-solid fa-image" class="text-7xl mb-3" />
          <span class="text-sm font-medium">Gambar tidak tersedia</span>
        </div>

        <!-- Bottom Metadata Overlay -->
        <div
          class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-6 py-2 rounded-full flex flex-col items-center pointer-events-auto backdrop-blur-sm shadow-lg border border-white/10 min-w-[200px]">
          <span class="font-bold text-sm truncate max-w-[250px] md:max-w-md">{{ images[currentIndex].title || 'Gambar' }}</span>
          <div class="flex items-center gap-3 text-[10px] text-white/70 mt-0.5 uppercase tracking-wider font-semibold">
            <span>{{ currentIndex + 1 }} OF {{ images.length }}</span>
            <template v-if="images[currentIndex].width && images[currentIndex].height">
              <span class="text-white/30">•</span>
              <span>{{ images[currentIndex].width }}×{{ images[currentIndex].height }}</span>
            </template>
            <template v-if="images[currentIndex].size_bytes">
              <span class="text-white/30">•</span>
              <span>{{ formatBytes(images[currentIndex].size_bytes) }}</span>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
