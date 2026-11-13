import { computed } from 'vue'
import { useI18n } from '@/core/infrastructure/localization'

export interface SelectOptionWithIcon<T = string> {
  value: T
  label: string
  icon?: string
}

export interface PeriodPresetOption {
  id: string
  name: string
}

/**
 * Menyediakan computed array opsi filter standar analitik (Tipe Produk, Status Stok, Periode Waktu)
 * agar tidak didefinisikan berulang kali di setiap komponen.
 */
export function useAnalyticsFilterOptions() {
  const { t } = useI18n()

  const productTypeOptions = computed<SelectOptionWithIcon<string>[]>(() => [
    { value: 'all', label: t('common.filter.all'), icon: 'fa-solid fa-layer-group' },
    { value: '0', label: t('analytics.inventory.opt_single'), icon: 'fa-solid fa-box' },
    { value: '1', label: t('analytics.inventory.opt_package'), icon: 'fa-solid fa-box-open' }
  ])

  const stockStatusOptions = computed<SelectOptionWithIcon<string>[]>(() => [
    { value: 'all', label: t('common.filter.all'), icon: 'fa-solid fa-boxes-stacked' },
    { value: 'positive', label: t('analytics.export.status_positive'), icon: 'fa-solid fa-plus' },
    { value: 'negative', label: t('analytics.movement.status_negative_short'), icon: 'fa-solid fa-minus' }
  ])

  const periodPresetOptions = computed<PeriodPresetOption[]>(() => [
    { id: '7d', name: t('common.time.last_7_days') },
    { id: '30d', name: t('common.time.last_30_days') },
    { id: 'month', name: t('common.time.this_month') }
  ])

  return {
    productTypeOptions,
    stockStatusOptions,
    periodPresetOptions
  }
}

