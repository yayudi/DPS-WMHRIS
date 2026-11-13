<script setup>
import { computed, watch } from 'vue'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import BaseTabs from '@/core/presentation/components/ui/BaseTabs.vue'

const { toast } = useToast()
const { t } = useI18n()

// Props untuk data dropdown
defineProps({
  myLocations: { type: Array, default: () => [] },
  allLocations: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false }
})

// Gunakan defineModel untuk two-way binding (v-model) dari induk
const activeTab = defineModel('activeTab')
const fromLocation = defineModel('fromLocation')
const toLocation = defineModel('toLocation')
const notes = defineModel('notes')

const tabs = computed(() => [
  { label: t('wms.batch_move.tab_single_location'), value: 'TRANSFER' },
  { label: t('wms.batch_move.tab_multi_location'), value: 'DETAILED_TRANSFER' },
  { label: t('wms.batch_move.tab_inbound'), value: 'INBOUND' }
])

watch([fromLocation, toLocation], ([newFrom, newTo]) => {
  if (newFrom && newTo && newFrom.id === newTo.id) {
    toast(t('wms.batch_move.same_location_error'), 'warning')
    toLocation.value = null
  }
})
</script>

<template>
  <div>
    <!-- Tabs navigation -->
    <BaseTabs :tabs="tabs" v-model:model-value="activeTab" />
    <div
      v-if="activeTab !== 'DETAILED_TRANSFER'"
      class="my-4 bg-secondary/50 rounded-xl border border-secondary/20 p-4 shadow-sm flex flex-col gap-4 relative z-30"
    >
      <div class="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        <!-- TRANSFER (BATCH) -->
        <template v-if="activeTab === 'TRANSFER'">
          <div class="md:col-span-3">
            <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.batch_move.from_location_label') }}</label>
            <BaseSelect
              v-model="fromLocation"
              :options="myLocations"
              :placeholder="t('wms.batch_move.select_from_location')"
              label="code"
              track-by="id"
              :disabled="isLoading"
            />
          </div>
          <div class="md:col-span-3">
            <label class="block text-sm font-medium text-text/90 mb-2">{{ t('common.label.to_location') }}</label>
            <BaseSelect
              v-model="toLocation"
              :options="allLocations"
              :placeholder="t('wms.batch_move.select_to_location')"
              label="code"
              track-by="id"
              :disabled="isLoading"
            />
          </div>
          <div class="md:col-span-6">
            <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.batch_move.notes_label') }}</label>
            <input
              v-model="notes"
              type="text"
              :placeholder="t('wms.batch_move.transfer_notes_placeholder')"
              class="w-full h-[42px] px-3 py-2 border border-secondary/50 rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm text-sm"
            />
          </div>
        </template>

        <!-- INBOUND ONLY -->
        <template v-if="activeTab === 'INBOUND'">
          <div class="md:col-span-6">
            <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.batch_move.inbound_to_label') }}</label>
            <BaseSelect
              v-model="toLocation"
              :options="allLocations"
              :placeholder="t('wms.batch_move.select_to_location')"
              label="code"
              track-by="id"
              :disabled="isLoading"
            />
          </div>
          <div class="md:col-span-6">
            <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.batch_move.notes_label') }}</label>
            <input
              v-model="notes"
              type="text"
              :placeholder="t('wms.batch_move.inbound_notes_placeholder')"
              class="w-full h-[42px] px-3 py-2 border border-secondary/50 rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm text-sm"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
