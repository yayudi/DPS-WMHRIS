<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: 'Judul Modal',
  },
})

const emit = defineEmits(['close'])
</script>

<template>
  <!-- Menggunakan <transition> untuk animasi muncul/hilang -->
  <transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="transform opacity-0 scale-95"
    enter-to-class="transform opacity-100 scale-100"
    leave-active-class="transition ease-in duration-100"
    leave-from-class="transform opacity-100 scale-100"
    leave-to-class="transform opacity-0 scale-95"
  >
    <!-- Backdrop (area gelap di belakang) -->
    <div
      v-if="show"
      @click.self="emit('close')"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50"
    >
      <!-- Panel Modal -->
      <div class="bg-background rounded-xl shadow-xl w-full max-w-xl flex flex-col">
        <!-- Header Modal -->
        <div class="p-4 border-b border-secondary/20 flex justify-between items-center">
          <h3 class="font-bold text-text text-lg">
            <!-- Slot untuk judul kustom jika diperlukan -->
            <slot name="title">{{ title }}</slot>
          </h3>
          <button
            @click="emit('close')"
            class="text-text/50 hover:text-primary transition-colors text-2xl font-light"
          >
            &times;
          </button>
        </div>

        <!-- Konten Utama Modal -->
        <div class="p-6">
          <!-- Slot default untuk konten apa pun -->
          <slot />
        </div>

        <!-- Footer Modal (opsional) -->
        <div v-if="$slots.footer" class="p-4 bg-secondary/10 flex justify-end gap-2 rounded-b-xl">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </transition>
</template>
