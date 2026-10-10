<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import notFoundGif from '@/assets/img/404.gif'

const router = useRouter()
const countdown = ref(10)
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      router.push({ name: 'WMS' })
    }
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const goHome = () => {
  clearInterval(timer)
  router.push({ name: 'WMS' })
}

const goBack = () => {
  clearInterval(timer)
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-background flex items-center justify-center p-6">
    <div class="max-w-lg w-full text-center space-y-6 animate-fade-in">

      <!-- GIF -->
      <div class="relative mx-auto w-72 h-72">
        <img :src="notFoundGif" alt="404 Not Found" class="w-full h-full object-cover" />
      </div>

      <!-- Text Content -->
      <div class="space-y-3">
        <h1 class="text-6xl font-black text-primary tracking-tight">404</h1>
        <h2 class="text-xl font-bold text-text">Halaman Tidak Ditemukan</h2>
        <p class="text-sm text-text/50 leading-relaxed max-w-sm mx-auto">
          Sepertinya halaman yang Anda cari sudah dipindahkan, dihapus, atau memang tidak pernah ada.
        </p>
      </div>

      <!-- Countdown -->
      <div class="flex items-center justify-center gap-2 text-xs text-text/40">
        <font-awesome-icon icon="fa-solid fa-clock" class="animate-pulse" />
        <span>Dialihkan ke beranda dalam <b class="text-primary">{{ countdown }}</b> detik</span>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-center gap-3 pt-2">
        <button @click="goBack"
          class="px-5 py-2.5 bg-secondary/20 hover:bg-secondary/40 text-text rounded-xl text-sm font-bold transition-all flex items-center gap-2 border border-secondary/20">
          <font-awesome-icon icon="fa-solid fa-arrow-left" />
          Kembali
        </button>
        <button @click="goHome"
          class="px-5 py-2.5 bg-primary hover:bg-primary/90 text-background rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20">
          <font-awesome-icon icon="fa-solid fa-house" />
          Ke Beranda
        </button>
      </div>

      <!-- Path Info -->
      <div class="pt-4 border-t border-secondary/10">
        <p class="text-[10px] text-text/30 font-mono truncate">
          Requested: {{ $route.fullPath }}
        </p>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeInUp 0.6s cubic-bezier(0.25, 0.8, 0.25, 1) both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
