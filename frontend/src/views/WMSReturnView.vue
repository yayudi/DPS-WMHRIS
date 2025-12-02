<script setup>
import SaleReturnTab from '@/components/SaleReturnTab.vue'
</script>

<template>
  <div class="p-6 min-h-screen bg-secondary/20">
    <div class="mb-6">
      <div class="flex items-center gap-3 text-text/50 text-sm font-bold mb-1">
        <router-link to="/wms" class="hover:text-primary transition-colors">
          <font-awesome-icon icon="fa-solid fa-arrow-left" /> Kembali ke Dashboard
        </router-link>
        <span>/</span>
        <span class="text-text">Validasi Retur</span>
      </div>
      <h2 class="text-2xl font-black text-text tracking-tight">
        Retur <span class="text-danger">Penjualan</span>
      </h2>
      <p class="text-text/60 text-sm mt-1">
        Kelola barang masuk dari retur customer (Marketplace/Offline).
      </p>
    </div>

    <!-- Panggil Komponen Logic Disini -->
    <SaleReturnTab />
  </div>
</template>
