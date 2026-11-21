// backend/validators/adminValidator.js
import { z } from "zod";
import {
  nullablePositiveInt,
  optionalNullableString,
  requiredPositiveInt,
  requiredTrimmedString,
} from "./zodHelpers.js";

const baseUserSchema = z.object({
  username: requiredTrimmedString("Username wajib diisi"),
  role_id: requiredPositiveInt("Role wajib dipilih"),
  nickname: optionalNullableString,
  shift_id: nullablePositiveInt("Shift ID tidak valid"),
  exclude_from_attendance: z.boolean().optional(),
});

export const createUserSchema = baseUserSchema.extend({
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export const updateUserSchema = baseUserSchema.extend({
  password: z.string().min(6, "Password minimal 6 karakter").optional().or(z.literal("")),
});

export const updateUserLocationsSchema = z.object({
  locationIds: z
    .array(requiredPositiveInt("ID lokasi tidak valid"), {
      error: "Input harus berupa array ID lokasi",
    })
    .min(0, "Input harus berupa array ID lokasi"),
});
