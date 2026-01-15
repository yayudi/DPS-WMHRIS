<!-- frontend/src/components/products/ProductRow.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  product: { type: Object, required: true },
  isSelected: Boolean,
})

const emit = defineEmits(['toggle-selection', 'edit', 'restore', 'delete'])

// Helper Format Mata Uang
const formattedPrice = computed(() => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(props.product.price)
})

// Helper Status
const isArchived = computed(() => {
  return props.product.is_active === 0 || props.product.deleted_at
})
</script>

<template>
  <tr
    class="hover:bg-secondary/5 transition-colors group border-b border-secondary/5 last:border-0"
    :class="{ 'bg-primary/5': isSelected, 'opacity-60 grayscale-[50%]': isArchived }"
  >
    <!-- CHECKBOX -->
    <td class="px-4 py-4 text-center w-12">
      <div class="flex items-center justify-center">
        <input
          type="checkbox"
          class="w-4 h-4 rounded border-secondary/30 text-primary focus:ring-primary bg-background cursor-pointer transition-all"
          :checked="isSelected"
          @change="$emit('toggle-selection', product.id)"
        />
      </div>
    </td>

    <!-- NAMA PRODUK -->
    <td class="px-4 py-4">
      <div class="flex flex-col">
        <div class="font-bold text-text text-sm flex items-center gap-2">
          {{ product.name }}
          <span
            v-if="product.is_package"
            class="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20 font-bold uppercase tracking-wider"
          >
            Paket
          </span>
        </div>
      </div>
    </td>

    <!-- SKU -->
    <td class="px-4 py-4">
      <span
        class="font-mono text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20 select-all"
      >
        {{ product.sku }}
      </span>
    </td>

    <!-- BERAT -->
    <td class="px-4 py-4 text-right text-sm font-mono text-text/70">
      {{ product.weight ? product.weight + ' gr' : '-' }}
    </td>

    <!-- HARGA -->
    <td class="px-4 py-4 text-right font-medium text-sm text-text">
      {{ formattedPrice }}
    </td>

    <!-- STATUS -->
    <td class="px-4 py-4 text-center">
      <span
        v-if="isArchived"
        class="px-2 py-1 text-[10px] font-bold rounded-full bg-secondary/20 text-text/50 border border-secondary/30 flex items-center justify-center gap-1 w-fit mx-auto"
      >
        <font-awesome-icon icon="fa-solid fa-box-archive" />
        DIARSIPKAN
      </span>
      <span
        v-else
        class="px-2 py-1 text-[10px] font-bold rounded-full bg-success/10 text-success border border-success/20 flex items-center justify-center gap-1 w-fit mx-auto"
      >
        <font-awesome-icon icon="fa-solid fa-check" />
        AKTIF
      </span>
    </td>

    <!-- AKSI -->
    <td class="px-4 py-4">
      <div
        class="flex items-center justify-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200"
      >
        <!-- Edit -->
        <button
          v-if="!isArchived"
          @click="$emit('edit', product)"
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 text-text/40 hover:text-primary transition-colors"
          title="Edit Data"
        >
          <font-awesome-icon icon="fa-solid fa-pen-to-square" />
        </button>

        <!-- Restore -->
        <button
          v-if="isArchived"
          @click="$emit('restore', product)"
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-success/10 text-text/40 hover:text-success transition-colors"
          title="Pulihkan Produk"
        >
          <font-awesome-icon icon="fa-solid fa-rotate-left" />
        </button>

        <!-- Archive/Delete -->
        <button
          v-if="!isArchived"
          @click="$emit('delete', product)"
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-danger/10 text-text/40 hover:text-danger transition-colors"
          title="Arsipkan Produk"
        >
          <font-awesome-icon icon="fa-solid fa-box-archive" />
        </button>
      </div>
    </td>
  </tr>
</template>
