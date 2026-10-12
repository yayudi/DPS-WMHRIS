<script setup>
defineProps({
  line1: {
    type: String,
    default: 'UD-08 NO'
  },
  line2: {
    type: String,
    default: 'AC 220'
  }
})
</script>

<template>
  <!-- Ukuran standar sticker thermal biasanya 80x40mm atau 80x50mm -->
  <!-- Kita gunakan rasio aspek yang proporsional -->
  <div
    class="sticker-template flex flex-col bg-white border border-gray-300 overflow-hidden relative select-none"
    style="width: 80mm; height: 40mm; box-sizing: border-box"
  >
    <!-- Header Biru -->
    <div
      class="h-[35%] bg-[#2C307A] flex items-center px-4 relative overflow-hidden"
      style="-webkit-print-color-adjust: exact; print-color-adjust: exact"
    >
      <!-- Logo DPV -->
      <img src="/dpv_logo.png" alt="DPV Logo" class="h-[75%] z-10 object-contain drop-shadow-md mx-auto" />

      <!-- Pattern Background (Decorative) -->
      <div
        class="absolute inset-0 opacity-[0.08] flex flex-wrap gap-2 items-center justify-center -rotate-12 scale-150 pointer-events-none"
      >
        <img v-for="i in 15" :key="i" src="/dpv_logo.png" class="w-8 h-8 grayscale" />
      </div>
    </div>

    <!-- Area Putih (Content) -->
    <div class="flex-1 flex flex-col items-center justify-center text-[#2C307A] bg-white px-2">
      <h1
        class="font-black uppercase tracking-wide m-0 leading-tight text-center truncate w-full"
        style="font-size: 18pt"
      >
        {{ line1 }}
      </h1>
      <h2
        class="font-black uppercase tracking-wide m-0 leading-tight text-center truncate w-full"
        style="font-size: 16pt"
      >
        {{ line2 }}
      </h2>
    </div>
  </div>
</template>

<style scoped>
/* Stylings for preview only, print overrides will be handled by the Modal */
</style>
