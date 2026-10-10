import { z } from 'zod'

export const productSchema = z.object({
  sku: z.string().min(3, 'SKU minimal 3 karakter').max(50, 'SKU maksimal 50 karakter'),
  name: z.string().min(3, 'Nama produk minimal 3 karakter').max(100, 'Nama produk maksimal 100 karakter'),
  category_id: z
    .union([z.number(), z.string()])
    .nullable()
    .refine(val => val !== null, {
      message: 'Kategori wajib dipilih'
    }),
  price: z.number().min(0, 'Harga tidak boleh negatif'),
  weight: z.number().min(0, 'Berat tidak boleh negatif'),
  is_package: z.boolean().default(false)
})

export type ProductFormDTO = z.infer<typeof productSchema>
