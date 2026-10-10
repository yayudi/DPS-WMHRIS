import { z } from 'zod'

export const wmsRowSchema = z.object({
  sku: z.string().min(1, 'SKU tidak boleh kosong'),
  quantity: z.number().positive('Jumlah harus lebih dari 0'),
  fromLocationId: z.union([z.number(), z.string(), z.null()]).optional(),
  toLocationId: z.union([z.number(), z.string(), z.null()]).optional()
})

export const wmsBulkSchema = z.array(wmsRowSchema).refine(
  rows => {
    for (const row of rows) {
      if (row.fromLocationId && row.toLocationId && row.fromLocationId === row.toLocationId) {
        return false
      }
    }
    return true
  },
  {
    message: 'Terdapat baris di mana Lokasi Asal dan Tujuan sama.'
  }
)

export type WmsRowDTO = z.infer<typeof wmsRowSchema>
