<!-- frontend\src\components\ui\ProductCardSkeleton.vue -->
<template>
  <div class="border border-secondary dark:border-secondary rounded-lg p-4 w-full animate-pulse">
    <!-- Placeholder untuk Gambar/Ikon -->
    <div class="h-16 w-16 bg-secondary rounded-md mb-4"></div>

    <!-- Placeholder untuk Nama Produk -->
    <div class="h-4 bg-secondary rounded w-3/4 mb-2"></div>

    <!-- Placeholder untuk SKU -->
    <div class="h-3 bg-secondary rounded w-1/2 mb-4"></div>

    <!-- Placeholder untuk Detail Stok -->
    <div class="flex justify-between items-center">
      <div class="h-4 bg-secondary rounded w-1/4"></div>
      <div class="h-4 bg-secondary rounded w-1/4"></div>
    </div>
  </div>
</template>
