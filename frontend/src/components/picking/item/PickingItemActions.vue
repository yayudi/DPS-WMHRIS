<!-- frontend/src/components/picking/item/PickingItemActions.vue -->
<script setup>
import { ref } from 'vue'
import PickingEditModal from '@/components/picking/PickingEditModal.vue'

defineProps({
  inv: { type: Object, required: true },
  mode: { type: String, default: 'picking' }, // 'picking' | 'history'
  hasStockIssue: { type: Boolean, default: false },
  canCancel: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  isOpen: { type: Boolean, default: false },
  showChevron: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  isRow: { type: Boolean, default: false }
})

const emit = defineEmits(['void-invoice', 'retry-backorder', 'items-updated', 'toggle-open'])

const isEditModalOpen = ref(false)
</script>

<template>
  <div class="flex items-center" :class="[isRow ? 'gap-1 sm:gap-1.5' : 'gap-1 mt-0.5']">
    <!-- Tombol Ubah Produk & Kuantitas -->
    <button
      v-if="mode === 'picking' && inv.status !== 'VOID'"
      type="button"
      @click.stop="isEditModalOpen = true"
      :disabled="isLoading"
      :class="[
        isRow
          ? 'w-8 h-8 flex items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary/70 hover:text-primary hover:border-primary transition-colors disabled:opacity-50 shrink-0'
          : compact
            ? 'w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary/70 hover:text-primary hover:border-primary transition-colors disabled:opacity-50'
            : 'group flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 min-h-[32px] px-2.5 py-1.5 text-[10px] font-bold text-primary/70 transition-colors hover:text-primary hover:border-primary disabled:opacity-50'
      ]"
      title="Ubah Produk & Kuantitas"
    >
      <font-awesome-icon icon="fa-solid fa-pen-to-square" class="text-xs" />
    </button>

    <!-- Tombol Cek Ulang Stok -->
    <button
      v-if="mode === 'picking' && hasStockIssue"
      type="button"
      @click.stop="emit('retry-backorder')"
      :disabled="isLoading"
      :class="[
        isRow
          ? 'w-8 h-8 flex items-center justify-center rounded-lg border border-warning/30 bg-warning/10 text-warning/70 hover:text-warning hover:border-warning transition-colors disabled:opacity-50 shrink-0'
          : compact
            ? 'w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-md border border-warning/30 bg-warning/10 text-warning/70 hover:text-warning hover:border-warning transition-colors disabled:opacity-50'
            : 'group flex items-center gap-1 rounded-lg border border-warning/30 bg-warning/10 min-h-[32px] px-2.5 py-1.5 text-[10px] font-bold text-warning/70 transition-colors hover:text-warning hover:border-warning disabled:opacity-50'
      ]"
      title="Cek ulang stok (Targeted Refresh)"
    >
      <font-awesome-icon
        :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-rotate-right'"
        :spin="isLoading"
        class="text-xs"
      />
    </button>

    <!-- Tombol Void -->
    <button
      v-if="canCancel && inv.status !== 'VOID'"
      type="button"
      @click.stop="emit('void-invoice')"
      :disabled="isLoading"
      :class="[
        isRow
          ? 'w-8 h-8 flex items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger/70 hover:text-danger hover:border-danger transition-colors disabled:opacity-50 shrink-0'
          : compact
            ? 'w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-md border border-danger bg-danger/10 text-danger/70 transition-colors hover:text-danger disabled:opacity-50'
            : 'group flex items-center gap-1 rounded-lg border border-danger/30 bg-danger/10 min-h-[32px] px-2.5 py-1.5 text-[10px] font-bold text-danger/70 transition-colors hover:text-danger hover:border-danger disabled:opacity-50'
      ]"
      title="Void"
    >
      <font-awesome-icon
        :icon="isLoading ? 'fa-solid fa-spinner' : (compact ? 'fa-solid fa-trash' : 'fa-solid fa-ban')"
        :spin="isLoading"
        class="text-xs"
      />
    </button>

    <!-- Chevron Toggle -->
    <div
      v-if="showChevron"
      @click.stop="emit('toggle-open')"
      :class="[
        isRow
          ? 'w-8 h-8 flex items-center justify-center rounded-full bg-secondary/10 text-text/40 group-hover:bg-secondary/20 transition-colors shrink-0 cursor-pointer'
          : 'w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-text/40 hover:bg-secondary/10 transition-colors cursor-pointer'
      ]"
    >
      <font-awesome-icon
        icon="fa-solid fa-chevron-down"
        class="transition-transform duration-300"
        :class="[
          isOpen ? 'rotate-180' : '',
          isRow ? 'text-[10px]' : 'text-xs'
        ]"
      />
    </div>

    <!-- Edit Modal -->
    <PickingEditModal
      :show="isEditModalOpen"
      :inv="inv"
      @close="isEditModalOpen = false"
      @saved="emit('items-updated', inv.id)"
    />
  </div>
</template>
