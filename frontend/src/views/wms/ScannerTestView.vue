<!-- frontend/src/views/wms/ScannerTestView.vue -->
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseQrScanner from '@/components/ui/BaseQrScanner.vue'

const router = useRouter()
const scanResult = ref('')
const isPaused = ref(false)

const handleDetect = (code) => {
  scanResult.value = code
  isPaused.value = true
  // Lakukan proses lanjutan di sini (misal lookup API)
}

const handleReset = () => {
  scanResult.value = ''
  isPaused.value = false
}

const handleBack = () => {
  router.push({ name: 'WMS' })
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col md:max-w-md md:mx-auto border-x border-secondary/30 relative">
    <!-- Header Mobile -->
    <header class="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-secondary/50 p-4 flex items-center gap-3">
      <button 
        @click="handleBack" 
        class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-secondary/20 transition-colors text-text"
      >
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <h1 class="text-lg font-bold text-text">Uji Coba Scanner</h1>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col p-4">
      
      <div class="text-center text-sm text-text/70 mb-6 px-4">
        Arahkan kamera ke QR Code untuk pemindaian. Pastikan pencahayaan cukup.
      </div>
      
      <!-- Scanner Component -->
      <BaseQrScanner 
        :paused="isPaused" 
        :interval="400"
        @detect="handleDetect" 
      />

      <!-- Result Card (Bottom Sheet style on Mobile) -->
      <div 
        v-if="scanResult" 
        class="mt-auto pt-8 pb-4"
      >
        <div class="bg-background border border-primary/20 p-5 rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div class="flex items-center gap-3 text-green-500 mb-3">
            <i class="fa-solid fa-circle-check text-2xl"></i>
            <span class="font-bold text-lg">Berhasil Dipindai!</span>
          </div>
          
          <div class="bg-background border border-secondary/30 p-3 rounded-lg break-all font-mono text-base text-text mb-6">
            {{ scanResult }}
          </div>
          
          <button 
            @click="handleReset"
            class="w-full py-3.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all active:scale-[0.98] flex justify-center items-center gap-2"
          >
            <i class="fa-solid fa-qrcode"></i>
            <span>Pindai QR Lain</span>
          </button>
        </div>
      </div>

    </main>
  </div>
</template>
