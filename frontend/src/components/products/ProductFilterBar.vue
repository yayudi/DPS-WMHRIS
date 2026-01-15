<script setup>
import { computed } from 'vue'
import FilterContainer from '@/components/ui/FilterContainer.vue'

const props = defineProps({
  filterType: String,
  filterStatus: String,
  searchBy: String,
  searchQuery: String,
})

const emit = defineEmits([
  'update:filterType',
  'update:filterStatus',
  'update:searchBy',
  'update:searchQuery',
])

// Wrapper computed untuk v-model agar kode template lebih bersih
const typeModel = computed({
  get: () => props.filterType,
  set: (val) => emit('update:filterType', val),
})

const statusModel = computed({
  get: () => props.filterStatus,
  set: (val) => emit('update:filterStatus', val),
})

const searchByModel = computed({
  get: () => props.searchBy,
  set: (val) => emit('update:searchBy', val),
})

const queryModel = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val),
})
</script>

<template>
  <FilterContainer title="Filter & Pencarian">
    <!-- Filter Tipe Produk -->
    <div
      class="flex bg-background rounded-xl p-1 border border-secondary/10 shrink-0 overflow-x-auto"
    >
      <button
        @click="typeModel = 'all'"
        class="px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
        :class="
          typeModel === 'all'
            ? 'bg-secondary/10 text-text shadow-sm'
            : 'text-text/50 hover:text-text hover:bg-secondary/5'
        "
      >
        Semua Tipe
      </button>
      <button
        @click="typeModel = 'single'"
        class="px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
        :class="
          typeModel === 'single'
            ? 'bg-primary/10 text-primary shadow-sm'
            : 'text-text/50 hover:text-primary hover:bg-primary/5'
        "
      >
        Satuan
      </button>
      <button
        @click="typeModel = 'package'"
        class="px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
        :class="
          typeModel === 'package'
            ? 'bg-accent/10 text-accent shadow-sm'
            : 'text-text/50 hover:text-accent hover:bg-accent/5'
        "
      >
        Paket
      </button>
    </div>

    <div class="h-px w-full lg:h-auto lg:w-px bg-secondary/10 mx-1 hidden lg:block"></div>

    <!-- Filter Status -->
    <div class="flex bg-background rounded-xl p-1 border border-secondary/10 shrink-0">
      <select
        v-model="statusModel"
        class="px-3 py-2 bg-transparent text-xs font-bold text-text focus:outline-none cursor-pointer hover:bg-secondary/5 rounded-lg appearance-none w-full"
        title="Filter Status Produk"
      >
        <option value="active">Produk Aktif</option>
        <option value="archived">Diarsipkan (Hapus)</option>
        <option value="all">Semua Status</option>
      </select>
      <div class="flex items-center px-2 pointer-events-none text-text/40">
        <font-awesome-icon icon="fa-solid fa-filter" class="text-xs" />
      </div>
    </div>

    <div class="h-px w-full lg:h-auto lg:w-px bg-secondary/10 mx-1 hidden lg:block"></div>

    <!-- Search Group -->
    <div class="flex flex-col sm:flex-row flex-1 gap-2">
      <div class="relative shrink-0 w-full sm:w-28">
        <select
          v-model="searchByModel"
          class="w-full h-full pl-3 pr-6 py-2.5 bg-background border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-text text-xs font-medium appearance-none cursor-pointer hover:bg-secondary/5 transition-colors"
        >
          <option value="name">Nama</option>
          <option value="sku">SKU</option>
        </select>
        <span
          class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-text/40"
        >
          <font-awesome-icon icon="fa-solid fa-chevron-down" class="text-[10px]" />
        </span>
      </div>

      <div class="relative flex-1">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-text/40">
          <font-awesome-icon icon="fa-solid fa-search" />
        </span>
        <input
          v-model="queryModel"
          type="text"
          :placeholder="`Cari ${searchBy === 'sku' ? 'SKU' : 'Nama'}...`"
          class="w-full pl-9 pr-4 py-2.5 bg-background border border-transparent rounded-xl focus:outline-none focus:border-primary text-text text-sm placeholder-text/30 transition-all shadow-sm"
        />
      </div>
    </div>
  </FilterContainer>
</template>
