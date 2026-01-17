<script setup>
import { ref } from "vue"

const toasts = ref([])
let idCounter = 0

const showMessage = (msg, type = "info", duration = 3000) => {
  const id = ++idCounter

  // Menentukan kelas tema dan ikon berdasarkan tipe pesan
  let typeInfo = {};
  switch (type) {
    case "success":
      typeInfo = {
        class: 'bg-primary text-secondary',
        icon: 'fa-solid fa-check-circle'
      };
      break;
    case "error":
      typeInfo = {
        class: 'bg-accent text-secondary',
        icon: 'fa-solid fa-exclamation-triangle'
      };
      break;
    default: // info
      typeInfo = {
        class: 'bg-secondary text-text',
        icon: 'fa-solid fa-info-circle'
      };
  }

  const toast = { id, message: msg, ...typeInfo }
  toasts.value.push(toast)

  // Hapus otomatis
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, duration)
}

// Mengekspos fungsi agar bisa dipanggil dari parent via ref
defineExpose({ showMessage })
</script>

<template>
  <div class="fixed top-5 right-5 space-y-3 z-[100]">
    <transition-group name="toast-fade" tag="div">
      <div v-for="toast in toasts" :key="toast.id" :class="[
        'px-4 py-3 text-sm font-medium rounded-lg shadow-lg flex items-center gap-3',
        toast.class
      ]">
        <font-awesome-icon :icon="toast.icon" />
        <span>{{ toast.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style>
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
