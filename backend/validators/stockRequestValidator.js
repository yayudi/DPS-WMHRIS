// backend/validators/stockRequestValidator.js
import { z } from "zod";
import { STOCK_REQUEST_STATUS, STOCK_REQUEST_TYPE } from "../config/wmsConstants.js";
import {
  createIdParamSchema,
  emptyToUndefined,
  optionalNullableString,
  optionalPositiveInt,
  paginationQueryShape,
  requiredNonNegativeNumber,
  requiredNumber,
  requiredPositiveInt,
} from "./zodHelpers.js";

const REQUEST_TYPE_RULES = {
  [STOCK_REQUEST_TYPE.TRANSFER]: {
    requireFrom: true,
    requireTo: true,
    distinctLocations: true,
    toMissingMsg: "Lokasi asal dan tujuan harus diisi untuk transfer.",
    isInvalidQty: (qty) => qty <= 0,
    qtyMsg: "Kuantitas transfer harus lebih dari 0.",
  },
  [STOCK_REQUEST_TYPE.STOCK_OPNAME]: {
    requireFrom: false,
    requireTo: true,
    distinctLocations: false,
    toMissingMsg: "Lokasi opname harus diisi.",
    isInvalidQty: (qty) => qty < 0,
    qtyMsg: "Kuantitas opname tidak boleh negatif.",
  },
};

export const getStockRequestsQuerySchema = z.object({
  status: z.preprocess(
    emptyToUndefined,
    z
      .enum(Object.values(STOCK_REQUEST_STATUS), { error: "Status permintaan stok tidak valid." })
      .optional(),
  ),
  fromLocationId: optionalPositiveInt("Lokasi asal tidak valid."),
  toLocationId: optionalPositiveInt("Lokasi tujuan tidak valid."),
  ...paginationQueryShape(50),
});

export const createStockRequestSchema = z
  .object({
    type: z
      .enum(Object.values(STOCK_REQUEST_TYPE), { error: "Tipe permintaan stok tidak valid." })
      .default(STOCK_REQUEST_TYPE.TRANSFER),
    fromLocationId: optionalPositiveInt("Lokasi asal harus berupa ID lokasi yang valid."),
    toLocationId: optionalPositiveInt("Lokasi tujuan harus berupa ID lokasi yang valid."),
    notes: optionalNullableString,
    items: z
      .array(
        z.object({
          productId: requiredPositiveInt("Product ID wajib diisi."),
          quantity: requiredNumber("Kuantitas wajib diisi."),
        }),
      )
      .min(1, "Minimal harus ada satu produk yang diminta."),
  })
  .superRefine((data, ctx) => {
    const rule = REQUEST_TYPE_RULES[data.type];
    if (!rule) return;

    if (rule.requireFrom && !data.fromLocationId) {
      ctx.addIssue({
        code: "custom",
        path: ["fromLocationId"],
        message: "Lokasi asal dan tujuan harus diisi untuk transfer.",
      });
    }

    if (rule.requireTo && !data.toLocationId) {
      ctx.addIssue({
        code: "custom",
        path: ["toLocationId"],
        message: rule.toMissingMsg,
      });
    }

    if (
      rule.distinctLocations &&
      data.fromLocationId &&
      data.toLocationId &&
      data.fromLocationId === data.toLocationId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["toLocationId"],
        message: "Lokasi asal dan tujuan tidak boleh sama.",
      });
    }

    data.items.forEach((item, index) => {
      if (rule.isInvalidQty(item.quantity)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "quantity"],
          message: rule.qtyMsg,
        });
      }
    });
  });

export const completeStockRequestSchema = z.preprocess(
  (val) => (val === undefined ? {} : val),
  z.object({
    receivedItems: z
      .array(
        z.object({
          productId: requiredPositiveInt("Product ID wajib diisi."),
          receivedQuantity: requiredNonNegativeNumber(
            "Kuantitas diterima wajib diisi.",
            "Kuantitas diterima tidak boleh negatif.",
          ),
        }),
      )
      .optional()
      .nullable(),
  }),
);

export const bulkActionStockRequestSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"], { error: "Aksi massal harus APPROVE atau REJECT." }),
  requestIds: z
    .array(requiredPositiveInt("ID permintaan stok tidak valid."))
    .min(1, "Tidak ada ID permintaan yang dipilih."),
});

export const stockRequestIdParamSchema = createIdParamSchema("id", "ID permintaan stok tidak valid.");
