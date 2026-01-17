<!-- frontend\src\components\ui\TableSkeleton.vue -->
<template>
  <tr class="animate-pulse border-b border-secondary/5 last:border-0">
    <!-- Checkbox Skeleton -->
    <td class="px-4 py-4 w-12 text-center">
      <div class="w-4 h-4 bg-secondary/10 rounded mx-auto"></div>
    </td>

    <!-- Name Skeleton -->
    <td class="px-4 py-4">
      <div class="flex flex-col gap-2">
        <div class="h-4 bg-secondary/10 rounded w-3/4"></div>
        <div class="h-3 bg-secondary/5 rounded w-1/2"></div>
      </div>
    </td>

    <!-- SKU Skeleton -->
    <td class="px-4 py-4">
      <div class="h-6 bg-secondary/10 rounded w-20"></div>
    </td>

    <!-- Weight Skeleton -->
    <td class="px-4 py-4 text-right">
      <div class="h-4 bg-secondary/10 rounded w-12 ml-auto"></div>
    </td>

    <!-- Price Skeleton -->
    <td class="px-4 py-4 text-right">
      <div class="h-4 bg-secondary/10 rounded w-24 ml-auto"></div>
    </td>

    <!-- Status Skeleton -->
    <td class="px-4 py-4 text-center">
      <div class="h-6 bg-secondary/10 rounded-full w-20 mx-auto"></div>
    </td>

    <!-- Actions Skeleton -->
    <td class="px-4 py-4">
      <div class="flex items-center justify-center gap-2">
        <div class="w-8 h-8 bg-secondary/10 rounded-lg"></div>
        <div class="w-8 h-8 bg-secondary/10 rounded-lg"></div>
        <div class="w-8 h-8 bg-secondary/10 rounded-lg"></div>
      </div>
    </td>
  </tr>
</template>
