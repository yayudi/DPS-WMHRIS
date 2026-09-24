<script setup>
import { computed } from 'vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const props = defineProps({
  pagination: {
    type: Object,
    required: true
    // Expected format: { page: Number, limit: Number, total: Number, totalPages: Number }
  },
  limitOptions: {
    type: Array,
    default: () => [10, 20, 50, 100]
  },
  showLimitPicker: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['changePage', 'update:limit'])

// Logic Pagination Visible Pages
const visiblePages = computed(() => {
  if (!props.pagination) return []
  const { page, totalPages } = props.pagination
  const delta = 2
  const range = []
  const rangeWithDots = []
  let l

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      range.push(i)
    }
  }

  range.forEach(i => {
    if (l) {
      if (i - l === 2) rangeWithDots.push(l + 1)
      else if (i - l !== 1) rangeWithDots.push('...')
    }
    rangeWithDots.push(i)
    l = i
  })
  return rangeWithDots
})

const changePage = p => {
  if (p !== '...' && p >= 1 && props.pagination && p <= props.pagination.totalPages) {
    emit('changePage', p)
  }
}

const handleJumpPage = e => {
  const val = parseInt(e.target.value)
  if (!isNaN(val)) changePage(val)
  e.target.value = ''
}
</script>

<template>
  <div
    class="shrink-0 px-6 py-3 bg-secondary/30 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 select-none w-full"
  >
    <!-- Info & Limit Picker -->
    <div class="flex items-center gap-4 text-xs text-text/70" v-if="pagination.total !== undefined">
      <div v-if="showLimitPicker" class="flex items-center gap-2">
        <span>Limit:</span>
        <BaseSelect
          :model-value="pagination.limit || limitOptions[0]"
          @update:modelValue="v => emit('update:limit', parseInt(v))"
          :options="limitOptions"
          :searchable="false"
          class="min-w-[70px]"
        />
      </div>
      <div v-if="showLimitPicker" class="h-4 w-px bg-secondary/20 hidden sm:block"></div>
      <span>
        Menampilkan <b>{{ (pagination.page - 1) * pagination.limit + 1 }}</b> -
        <b>{{ Math.min(pagination.page * pagination.limit, pagination.total) }}</b> dari
        <b>{{ pagination.total }}</b> data
      </span>
    </div>

    <div v-else class="flex items-center gap-4 text-xs text-text/70">
      <span class="text-sm font-medium opacity-70">
        Halaman {{ pagination.page }} dari {{ pagination.totalPages }}
      </span>
    </div>

    <!-- Navigation Buttons -->
    <div class="flex items-center gap-1" v-if="pagination.totalPages > 1">
      <button
        @click="changePage(1)"
        :disabled="pagination.page === 1"
        class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Halaman Pertama"
      >
        <font-awesome-icon icon="fa-solid fa-angles-left" />
      </button>
      <button
        @click="changePage(pagination.page - 1)"
        :disabled="pagination.page === 1"
        class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Halaman Sebelumnya"
      >
        <font-awesome-icon icon="fa-solid fa-angle-left" />
      </button>

      <div class="flex items-center gap-1 mx-1" v-if="!isMobile">
        <template v-for="(p, i) in visiblePages" :key="i">
          <div v-if="p === '...'" class="relative w-8 h-8 group">
            <input
              type="number"
              class="w-full h-full text-center text-xs font-bold bg-transparent border border-secondary/20 rounded-lg focus:border-primary outline-none remove-arrow transition-all"
              placeholder="..."
              @keydown.enter="handleJumpPage"
            />
          </div>
          <button
            v-else
            @click="changePage(p)"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all"
            :class="[
              p === pagination.page
                ? 'bg-primary text-secondary shadow-md shadow-primary/20'
                : 'border border-secondary/20 hover:bg-secondary/10 hover:text-primary text-text/70'
            ]"
          >
            {{ p }}
          </button>
        </template>
      </div>

      <div class="flex items-center gap-2 mx-1" v-else>
        <div class="relative w-12 h-8 group">
          <input
            type="number"
            class="w-full h-full text-center text-xs font-bold bg-transparent border border-secondary/20 rounded-lg focus:border-primary outline-none remove-arrow transition-all"
            :value="pagination.page"
            @keydown.enter="handleJumpPage"
            @blur="handleJumpPage"
          />
        </div>
        <span class="text-xs text-text/50 font-bold">/ {{ pagination.totalPages }}</span>
      </div>

      <button
        @click="changePage(pagination.page + 1)"
        :disabled="pagination.page === pagination.totalPages"
        class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Halaman Selanjutnya"
      >
        <font-awesome-icon icon="fa-solid fa-angle-right" />
      </button>
      <button
        @click="changePage(pagination.totalPages)"
        :disabled="pagination.page === pagination.totalPages"
        class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Halaman Terakhir"
      >
        <font-awesome-icon icon="fa-solid fa-angles-right" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.remove-arrow::-webkit-outer-spin-button,
.remove-arrow::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.remove-arrow {
  appearance: textfield;
  -moz-appearance: textfield;
}
</style>
