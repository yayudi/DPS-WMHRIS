<!-- frontend\src\components\Modal.vue -->
<script setup>
import { watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Judul Modal'
  },
  maxWidth: {
    type: String,
    default: 'max-w-xl'
  },
  height: {
    type: String
  }
})

const emit = defineEmits(['close'])

const { Escape } = useMagicKeys()
watch(Escape, pressed => {
  if (props.show && pressed) {
    emit('close')
  }
})
</script>

<template>
  <!-- Menggunakan <transition> untuk animasi muncul/hilang -->
  <transition
    :enter-active-class="isMobile ? 'transition ease-out duration-300' : 'transition ease-out duration-200'"
    :enter-from-class="isMobile ? 'transform translate-y-full opacity-0' : 'transform opacity-0 scale-95'"
    :enter-to-class="isMobile ? 'transform translate-y-0 opacity-100' : 'transform opacity-100 scale-100'"
    :leave-active-class="isMobile ? 'transition ease-in duration-200' : 'transition ease-in duration-100'"
    :leave-from-class="isMobile ? 'transform translate-y-0 opacity-100' : 'transform opacity-100 scale-100'"
    :leave-to-class="isMobile ? 'transform translate-y-full opacity-0' : 'transform opacity-0 scale-95'"
  >
    <!-- Backdrop (area gelap di belakang) -->
    <div
      v-if="show"
      @click.self="emit('close')"
      class="fixed inset-0 bg-text bg-opacity-60 flex justify-center z-[99999] transition-all duration-300"
      :class="isMobile ? 'items-end p-0' : 'items-center p-4'"
    >
      <!-- Panel Modal -->
      <div
        class="bg-background shadow-xl w-full flex flex-col transition-all duration-300 max-h-[90vh]"
        :class="isMobile ? 'max-w-full rounded-t-2xl rounded-b-none mb-0' : `${height} ${maxWidth} rounded-xl`"
      >
        <!-- Header Modal -->
        <div class="p-4 flex justify-between items-center shrink-0">
          <h3 class="font-bold text-text text-lg">
            <!-- Slot untuk judul kustom jika diperlukan -->
            <slot name="title">{{ title }}</slot>
          </h3>
          <button
            @click="emit('close')"
            class="text-text/50 hover:text-primary transition-colors text-2xl font-light align-top mt-[-10px]"
          >
            &times;
          </button>
        </div>

        <!-- Konten Utama Modal -->
        <div class="px-4 pb-4 overflow-y-auto custom-scrollbar flex-1">
          <!-- Slot default untuk konten apa pun -->
          <slot />
        </div>

        <!-- Footer Modal (opsional) -->
        <div
          v-if="$slots.footer"
          class="py-3 px-4 bg-secondary flex justify-end gap-2 shrink-0"
          :class="isMobile ? 'rounded-none justify-center' : 'rounded-b-xl'"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </transition>
</template>
