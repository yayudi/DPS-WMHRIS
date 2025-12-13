<!-- frontend\src\views\wms\Return.vue -->
<script setup>
import SaleReturnTab from '@/components/wms/return/SaleReturnTab.vue'
</script>

<template>
  <div class="p-6 min-h-screen bg-secondary/20">
    <div class="mb-6">
      <h2 class="text-2xl font-black text-text tracking-tight">
        <font-awesome-icon icon="fa-solid fa-rotate-left" class="text-danger" />
        <span class="text-danger">Retur </span>Penjualan
      </h2>
      <p class="text-text/60 text-sm mt-1">
        Kelola barang masuk dari retur customer (Marketplace/Offline).
      </p>
    </div>

    <!-- Panggil Komponen Logic Disini -->
    <SaleReturnTab />
  </div>
</template>
