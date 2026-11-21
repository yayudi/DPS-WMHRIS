import { z } from "zod";
import { nullablePositiveInt } from "./zodHelpers.js";

/**
 * Zod Schema untuk validasi pembuatan dan pembaruan produk.
 * Menggunakan z.preprocess dan z.coerce karena data sering kali dikirim melalui FormData
 * di mana semua tipe data pada dasarnya adalah string.
 */
export const productSchema = z.object({
  sku: z.string().min(1, "SKU wajib diisi").optional(), // optional saat update
  name: z.string().min(1, "Nama wajib diisi").optional(),
  category_id: nullablePositiveInt("Category ID tidak valid"),
  price: z.coerce.number().optional().default(0),
  weight: z.coerce.number().optional().default(0),
  length: z.coerce.number().optional().default(0),
  width: z.coerce.number().optional().default(0),
  height: z.coerce.number().optional().default(0),
  is_package: z.preprocess((val) => val === "true" || val === true || val === 1 || val === "1", z.boolean().optional()),
  is_active: z.preprocess((val) => val === "true" || val === true || val === 1 || val === "1", z.boolean().optional()),
  components: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    }
    return val;
  }, z.array(z.any()).optional()),
  mediaIds: z.preprocess((val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    }
    return val || [];
  }, z.array(z.number()).optional()),
}).refine((data) => {
  // Jika ini paket, komponen tidak boleh kosong (hanya cek jika components dikirim)
  if (data.is_package && data.components !== undefined && data.components.length === 0) {
    return false;
  }
  return true;
}, {
  message: "Produk paket wajib memiliki minimal 1 komponen",
  path: ["components"],
});

export const linkMediaSchema = z.object({
  mediaIds: z.array(z.number().int().positive()).min(1, "Media ID tidak valid atau kosong."),
});
