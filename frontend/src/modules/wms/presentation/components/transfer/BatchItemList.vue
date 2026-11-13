<script setup>
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { useMobile } from '@/core/presentation/composables/useMobile'

const props = defineProps({
  items: { type: Array, required: true },
  activeTab: { type: String, required: true }
})

const emit = defineEmits(['remove-item', 'duplicate-item'])
const { toast } = useToast()
const { t } = useI18n()
const { isMobile } = useMobile()

function emitRemove(index) {
  emit('remove-item', index)
}
function emitDuplicate(index) {
  emit('duplicate-item', index)
}

function validateQuantity(item) {
  if (props.activeTab === 'TRANSFER') {
    if (item.quantity > item.current_stock) {
      item.quantity = item.current_stock
      toast(t('wms.batch_item.qty_exceed_stock', { stock: item.current_stock }), 'warning')
    }
    if (item.quantity < 1 || isNaN(item.quantity)) {
      item.quantity = 1
    }
  } else if (props.activeTab === 'ADJUSTMENT') {
    if (isNaN(item.quantity)) {
      item.quantity = 0
    }
    if (item.quantity < -item.current_stock) {
      item.quantity = -item.current_stock
      toast(t('wms.batch_item.reduction_exceed_stock', { stock: item.current_stock }), 'warning')
    }
  } else if (props.activeTab === 'INBOUND' || props.activeTab === 'RETURN') {
    if (item.quantity < 1 || isNaN(item.quantity)) {
      item.quantity = 1
    }
  }
}
</script>

<template>
  <div class="border-t border-secondary/20 pt-4">
    <h3 class="text-lg font-semibold text-text mb-3">{{ t('wms.batch_item.item_list') }} ({{ items.length }})</h3>
    <div
      v-if="items.length === 0"
      class="text-center text-text/60 py-5 border-2 border-dashed border-secondary/20 rounded-lg"
    >
      {{ t('wms.batch_item.empty_items') }}
    </div>
    <div v-else class="max-h-96 overflow-y-auto">
      <table class="text-sm" :class="isMobile ? 'w-full block' : 'min-w-full'">
        <thead :class="isMobile ? 'hidden' : 'bg-secondary/10'">
          <tr>
            <th class="p-2 text-left w-24">{{ t('common.label.sku') }}</th>
            <th class="p-2 text-left w-[40%] min-w-[200px]">{{ t('common.label.product_name') }}</th>
            <th class="p-2 text-center" v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'">{{ t('common.label.current_stock') }}</th>
            <th class="p-2 text-center w-40">{{ t('common.label.quantity') }}</th>
            <th class="p-2 text-center w-20">{{ t('common.label.action') }}</th>
          </tr>
        </thead>
        <tbody :class="isMobile ? 'block' : 'divide-y divide-secondary/20'">
          <tr
            v-for="(item, index) in items"
            :key="item._id || item.sku + index"
            class="transition-colors relative"
            :class="
              isMobile
                ? 'block mb-3 p-3 bg-background/50 rounded-xl border border-secondary/20 shadow-sm'
                : 'hover:bg-primary/5'
            "
          >
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.sku') }}</span>
              <span class="font-mono">{{ item.sku }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.product_name') }}</span>
              <span>{{ item.name }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 text-center'
              "
              v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.current_stock') }}</span>
              <span>{{ item.current_stock }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 text-center'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.quantity') }}</span>
              <div class="flex items-center" :class="isMobile ? 'justify-end gap-2' : 'justify-center gap-2'">
                <input
                  v-model.number="item.quantity"
                  @blur="validateQuantity(item)"
                  type="number"
                  :min="activeTab === 'ADJUSTMENT' ? undefined : 1"
                  :max="activeTab === 'TRANSFER' ? item.current_stock : undefined"
                  class="w-20 p-1 border border-secondary/50 rounded bg-background text-center font-bold"
                  :class="{
                    'text-success': item.quantity > 0 && activeTab === 'ADJUSTMENT',
                    'text-danger': item.quantity < 0
                  }"
                />
              </div>
            </td>
            <td :class="isMobile ? 'pt-3 mt-2 border-t border-secondary/10 block' : 'p-2 text-center'">
              <div class="flex items-center justify-center gap-2">
                <button
                  @click="emitDuplicate(index)"
                  v-if="!isMobile"
                  class="text-primary hover:text-primary/80 px-2"
                  :title="t('wms.batch_item.duplicate')"
                >
                  <font-awesome-icon icon="fa-solid fa-copy" />
                </button>
                <button
                  @click="emitRemove(index)"
                  :class="
                    isMobile
                      ? 'text-danger hover:bg-danger/10 flex items-center justify-center gap-2 w-full py-2 bg-danger/5 rounded-lg transition-colors'
                      : 'text-danger hover:text-danger/80 px-2'
                  "
                >
                  <font-awesome-icon icon="fa-solid fa-trash" />
                  <span v-if="isMobile" class="text-sm font-semibold">{{ t('wms.batch_item.delete_item') }}</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
