import { z } from 'zod'

export const shiftSchema = z.object({
  name: z.string().min(1, 'Nama shift wajib diisi').max(50, 'Nama shift maksimal 50 karakter'),
  start_time: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Format jam masuk tidak valid'),
  end_time: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Format jam pulang tidak valid'),
  flexible_minutes: z.number().min(0, 'Toleransi keterlambatan tidak boleh negatif'),
  work_days: z.string().min(1, 'Pilih minimal 1 hari kerja'),
  is_default: z.boolean().optional()
})

export type ShiftFormDTO = z.infer<typeof shiftSchema>
