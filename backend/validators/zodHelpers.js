// backend/validators/zodHelpers.js
import { z } from "zod";

/**
 * Mengubah null, undefined, atau string kosong menjadi undefined sebelum validasi Zod.
 * Mencegah z.coerce.number() mengonversi null/"" menjadi 0.
 * @param {unknown} val
 * @returns {unknown}
 */
export const emptyToUndefined = (val) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return val;
};

/**
 * Mengubah null, undefined, atau string kosong menjadi null sebelum validasi Zod.
 * @param {unknown} val
 * @returns {unknown}
 */
export const emptyToNull = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  return val;
};

/**
 * Normalisasi internal input numerik: string kosong/null/undefined -> undefined, boolean -> NaN.
 * @param {unknown} val
 * @returns {unknown}
 */
const preprocessNumericRequired = (val) => {
  const cleaned = emptyToUndefined(val);
  if (typeof cleaned === "boolean") return Number.NaN;
  return cleaned;
};

/**
 * Normalisasi internal input numerik nullable: undefined tetap undefined, null/"" -> null, boolean -> NaN.
 * @param {unknown} val
 * @returns {unknown}
 */
const preprocessNumericNullable = (val) => {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof val === "boolean") return Number.NaN;
  return val;
};

/**
 * Skema integer positif wajib (> 0), mendukung string numerik.
 * @param {string} [message="ID wajib diisi"]
 * @returns {z.ZodTypeAny}
 */
export const requiredPositiveInt = (message = "ID wajib diisi") =>
  z.preprocess(
    preprocessNumericRequired,
    z.coerce.number({ error: message }).int(message).positive(message),
  );

/**
 * Skema integer positif opsional (> 0). Nilai null/"" diubah menjadi undefined.
 * @param {string} [message="ID harus berupa bilangan bulat positif"]
 * @returns {z.ZodTypeAny}
 */
export const optionalPositiveInt = (message = "ID harus berupa bilangan bulat positif") =>
  z.preprocess(
    preprocessNumericRequired,
    z.coerce.number({ error: message }).int(message).positive(message).optional(),
  );

/**
 * Skema integer positif opsional & nullable (> 0). Nilai "" diubah menjadi null, undefined tetap undefined.
 * @param {string} [message="ID tidak valid"]
 * @returns {z.ZodTypeAny}
 */
export const nullablePositiveInt = (message = "ID tidak valid") =>
  z.preprocess(
    preprocessNumericNullable,
    z.coerce.number({ error: message }).int(message).positive(message).nullable().optional(),
  );

/**
 * Skema angka wajib (boleh negatif/nol/desimal).
 * @param {string} [message="Angka wajib diisi"]
 * @returns {z.ZodTypeAny}
 */
export const requiredNumber = (message = "Angka wajib diisi") =>
  z.preprocess(preprocessNumericRequired, z.coerce.number({ error: message }));

/**
 * Skema angka positif wajib (> 0).
 * @param {string} [requiredMsg="Kuantitas wajib diisi"]
 * @param {string} [positiveMsg="Kuantitas harus lebih dari 0"]
 * @returns {z.ZodTypeAny}
 */
export const requiredPositiveNumber = (
  requiredMsg = "Kuantitas wajib diisi",
  positiveMsg = "Kuantitas harus lebih dari 0",
) => z.preprocess(preprocessNumericRequired, z.coerce.number({ error: requiredMsg }).gt(0, positiveMsg));

/**
 * Skema angka non-negatif wajib (>= 0).
 * @param {string} [requiredMsg="Kuantitas wajib diisi"]
 * @param {string} [nonNegativeMsg="Kuantitas tidak boleh negatif"]
 * @returns {z.ZodTypeAny}
 */
export const requiredNonNegativeNumber = (
  requiredMsg = "Kuantitas wajib diisi",
  nonNegativeMsg = "Kuantitas tidak boleh negatif",
) => z.preprocess(preprocessNumericRequired, z.coerce.number({ error: requiredMsg }).min(0, nonNegativeMsg));

/**
 * Skema angka tidak nol wajib (!== 0).
 * @param {string} [requiredMsg="Kuantitas wajib diisi"]
 * @param {string} [nonZeroMsg="Kuantitas tidak boleh 0"]
 * @returns {z.ZodTypeAny}
 */
export const requiredNonZeroNumber = (
  requiredMsg = "Kuantitas wajib diisi",
  nonZeroMsg = "Kuantitas tidak boleh 0",
) =>
  z.preprocess(
    preprocessNumericRequired,
    z.coerce.number({ error: requiredMsg }).refine((val) => val !== 0, nonZeroMsg),
  );

/**
 * Skema Product ID (string non-kosong atau integer positif).
 * @param {string} [message="Product ID wajib diisi"]
 * @returns {z.ZodTypeAny}
 */
export const requiredProductId = (message = "Product ID wajib diisi") =>
  z.union(
    [
      z.string().trim().min(1, message),
      z.number().int(message).positive(message),
    ],
    { error: message },
  );

/**
 * Skema string wajib setelah trim.
 * @param {string} [message="Field wajib diisi"]
 * @returns {z.ZodString}
 */
export const requiredTrimmedString = (message = "Field wajib diisi") =>
  z.string({ error: message }).trim().min(1, message);

/**
 * Skema string opsional yang mengizinkan null.
 */
export const optionalNullableString = z.string().optional().nullable();

/**
 * Skema string tanggal format YYYY-MM-DD wajib.
 * @param {string} [requiredMsg="Tanggal wajib diisi"]
 * @param {string} [formatMsg="Format tanggal tidak valid (YYYY-MM-DD)"]
 * @returns {z.ZodString}
 */
export const isoDateString = (
  requiredMsg = "Tanggal wajib diisi",
  formatMsg = "Format tanggal tidak valid (YYYY-MM-DD)",
) => z.string({ error: requiredMsg }).regex(/^\d{4}-\d{2}-\d{2}$/, formatMsg);

/**
 * Mengembalikan shape pagination standar (page & limit) untuk query parameters.
 * @param {number} [defaultLimit=50]
 * @returns {{ page: z.ZodTypeAny, limit: z.ZodTypeAny }}
 */
export const paginationQueryShape = (defaultLimit = 50) => ({
  page: z.preprocess(preprocessNumericRequired, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(preprocessNumericRequired, z.coerce.number().int().min(1).default(defaultLimit)),
});

/**
 * Factory skema validasi ID pada req.params.
 * @param {string} [paramKey="id"]
 * @param {string} [message="ID tidak valid"]
 * @returns {z.ZodObject}
 */
export const createIdParamSchema = (paramKey = "id", message = "ID tidak valid") =>
  z.object({
    [paramKey]: requiredPositiveInt(message),
  });

/**
 * Memastikan argumen schema adalah instance skema Zod yang mendukung .refine().
 * @param {unknown} schema
 * @returns {void}
 * @throws {TypeError}
 */
const assertRefinableSchema = (schema) => {
  if (typeof schema?.refine !== "function") {
    throw new TypeError("Schema harus berupa ZodObject yang mendukung .refine()");
  }
};

/**
 * Membungkus ZodObject dengan validasi lokasi asal dan tujuan tidak boleh sama.
 * Panggil .extend() pada ZodObject terlebih dahulu sebelum membungkus dengan helper ini.
 * @param {z.ZodObject} schema
 * @param {string} [fromKey="fromLocationId"]
 * @param {string} [toKey="toLocationId"]
 * @param {string} [message="Lokasi asal dan tujuan tidak boleh sama"]
 * @returns {z.ZodTypeAny}
 */
export const withDistinctLocations = (
  schema,
  fromKey = "fromLocationId",
  toKey = "toLocationId",
  message = "Lokasi asal dan tujuan tidak boleh sama",
) => {
  assertRefinableSchema(schema);
  return schema.refine(
    (data) =>
      data[fromKey] === undefined ||
      data[toKey] === undefined ||
      data[fromKey] !== data[toKey],
    {
      message,
      path: [toKey],
    },
  );
};

/**
 * Membungkus ZodObject dengan validasi startDate <= endDate.
 * Panggil .extend() pada ZodObject terlebih dahulu sebelum membungkus dengan helper ini.
 * @param {z.ZodObject} schema
 * @param {string} [startKey="startDate"]
 * @param {string} [endKey="endDate"]
 * @param {string} [message="Tanggal mulai tidak boleh lebih besar dari tanggal selesai"]
 * @returns {z.ZodTypeAny}
 */
export const withValidDateRange = (
  schema,
  startKey = "startDate",
  endKey = "endDate",
  message = "Tanggal mulai tidak boleh lebih besar dari tanggal selesai",
) => {
  assertRefinableSchema(schema);
  return schema.refine((data) => data[startKey] <= data[endKey], {
    message,
    path: [endKey],
  });
};
