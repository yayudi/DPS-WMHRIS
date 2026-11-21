// backend/validators/returnValidator.js
import { z } from "zod";
import {
  optionalNullableString,
  requiredNonNegativeNumber,
  requiredPositiveInt,
  requiredTrimmedString,
} from "./zodHelpers.js";

export const createManualReturnSchema = z.object({
  productId: requiredPositiveInt("Product ID wajib diisi"),
  quantity: requiredPositiveInt("Quantity harus lebih besar dari 0"),
  locationId: requiredPositiveInt("Location ID wajib diisi"),
  condition: requiredTrimmedString("Kondisi wajib diisi"),
  reference: optionalNullableString,
  notes: optionalNullableString,
});

export const approveReturnSchema = z.object({
  itemId: requiredPositiveInt("Item ID wajib diisi"),
  qtyAccepted: requiredNonNegativeNumber(
    "Qty Accepted wajib diisi",
    "Qty Accepted tidak boleh negatif",
  ).refine((val) => Number.isInteger(val), "Qty Accepted harus bilangan bulat"),
  locationId: requiredPositiveInt("Location ID wajib diisi"),
  condition: requiredTrimmedString("Condition wajib diisi"),
  notes: optionalNullableString,
});
