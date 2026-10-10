<script setup>
const props = defineProps({
  items: { type: Array, required: true },
  activeTab: { type: String, required: true }
})

import { useToast } from '@/composables/useToast'
const { toast } = useToast()

const emit = defineEmits(['remove-item', 'duplicate-item'])

import { useMobile } from '@/composables/useMobile'
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
      toast(`Kuantitas melebihi stok saat ini (${item.current_stock}).`, 'warning')
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
      toast(`Pengurangan melebihi stok yang tersedia (${item.current_stock}).`, 'warning')
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
    <h3 class="text-lg font-semibold text-text mb-3">Daftar Item ({{ items.length }})</h3>
    <div
      v-if="items.length === 0"
      class="text-center text-text/60 py-5 border-2 border-dashed border-secondary/20 rounded-lg"
    >
      Belum ada item yang ditambahkan.
    </div>
    <div v-else class="max-h-96 overflow-y-auto">
      <table class="text-sm" :class="isMobile ? 'w-full block' : 'min-w-full'">
        <thead :class="isMobile ? 'hidden' : 'bg-secondary/10'">
          <tr>
            <th class="p-2 text-left w-24">SKU</th>
            <th class="p-2 text-left w-[40%] min-w-[200px]">Nama Produk</th>
            <th class="p-2 text-center" v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'">Stok Saat Ini</th>
            <th class="p-2 text-center w-40">Jumlah</th>
            <th class="p-2 text-center w-20">Aksi</th>
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
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">SKU</span>
              <span class="font-mono">{{ item.sku }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Produk</span>
              <span>{{ item.name }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 text-center'
              "
              v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Stok</span>
              <span>{{ item.current_stock }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 text-center'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Jumlah</span>
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
                  title="Duplikasi"
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
                  <span v-if="isMobile" class="text-sm font-semibold">Hapus Item</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
