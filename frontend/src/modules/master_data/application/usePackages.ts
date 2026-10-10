import { useToast } from '@/composables/useToast'
import { packageApi } from '../infrastructure/package.api'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'

export function usePackages() {
  const { toast } = useToast()

  const usePackageSearchQuery = (searchParams: any) => {
    return useQuery({
      queryKey: ['packages', searchParams],
      queryFn: async () => {
        const response = await packageApi.getPackages(searchParams.value)
        return response
      },
      placeholderData: keepPreviousData,
      staleTime: 60 * 1000 // 1 minute
    })
  }

  const exportPackages = async (params: Record<string, any>) => {
    try {
      return await packageApi.exportPackages(params)
    } catch (err: any) {
      toast(err.message || 'Gagal mengekspor paket', 'error')
      throw err
    }
  }

  const uploadPackageUpdate = async (formData: FormData) => {
    try {
      return await packageApi.uploadPackageUpdate(formData)
    } catch (err: any) {
      toast(err.message || 'Gagal mengupload pembaruan paket', 'error')
      throw err
    }
  }

  return {
    usePackageSearchQuery,
    exportPackages,
    uploadPackageUpdate
  }
}
