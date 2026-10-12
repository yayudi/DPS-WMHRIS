<script setup>
import StockTimelineSlider from './StockTimelineSlider.vue';
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue';

defineProps({
  show: {
    type: Boolean,
    required: true
  },
  productId: {
    type: String,
    required: false
  }
});

defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <BaseModal :show="show" @close="$emit('close')" maxWidth="max-w-3xl">
      <template #title>
        <div class="flex items-center gap-2 -mt-1">
          <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-primary text-sm" />
          <span class="font-bold text-sm text-text">Timeline Stok</span>
        </div>
      </template>

      <!-- Content -->
      <div class="-mx-6 px-4">
        <StockTimelineSlider v-if="productId" :productId="productId" :buildings="[]" />
      </div>
    </BaseModal>
  </Teleport>
</template>
