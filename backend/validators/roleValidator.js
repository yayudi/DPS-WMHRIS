// backend/validators/roleValidator.js
import { z } from "zod";

export const roleSchema = z.object({
  name: z.string().min(1, "Nama peran wajib diisi"),
  description: z.string().optional(),
});

export const assignPermissionsSchema = z.object({
  permissionIds: z.array(z.coerce.number(), {
    error: "Input harus berupa array ID izin.",
  }),
});
