<script setup>
defineProps({
  items: { type: Array, required: true },
  activeTab: { type: String, required: true },
})

const emit = defineEmits(['remove-item'])

function emitRemove(sku) {
  emit('remove-item', sku)
}
</script>

<template>
  <div class="border-t border-secondary/20 pt-6">
    <h3 class="text-lg font-semibold text-text mb-4">Daftar Item ({{ items.length }})</h3>
    <div
      v-if="items.length === 0"
      class="text-center text-text/60 py-8 border-2 border-dashed border-secondary/20 rounded-lg"
    >
      Belum ada item yang ditambahkan.
    </div>
    <div v-else class="max-h-96 overflow-y-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-secondary/10">
          <tr>
            <th class="p-2 text-left">SKU</th>
            <th class="p-2 text-left">Nama Produk</th>
            <th
              class="p-2 text-center"
              v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
            >
              Stok Saat Ini
            </th>
            <th class="p-2 text-center">Jumlah</th>
            <th class="p-2 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/20">
          <tr v-for="item in items" :key="item.sku" class="hover:bg-primary/5">
            <td class="p-2 font-mono">{{ item.sku }}</td>
            <td class="p-2">{{ item.name }}</td>
            <td
              class="p-2 text-center"
              v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
            >
              {{ item.current_stock }}
            </td>
            <td
              class="p-2 text-center font-bold"
              :class="{ 'text-success': item.quantity > 0, 'text-danger': item.quantity < 0 }"
            >
              {{ item.quantity }}
            </td>
            <td class="p-2 text-center">
              <button @click="emitRemove(item.sku)" class="text-danger hover:text-danger/80">
                <font-awesome-icon icon="fa-solid fa-trash" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
