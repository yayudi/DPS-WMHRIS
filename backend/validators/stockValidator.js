import { z } from "zod";
import { STOCK_MOVEMENT_TYPE } from "../config/wmsConstants.js";
import {
  createIdParamSchema,
  isoDateString,
  optionalNullableString,
  optionalPositiveInt,
  paginationQueryShape,
  requiredNonZeroNumber,
  requiredNumber,
  requiredPositiveInt,
  requiredPositiveNumber,
  requiredProductId,
  requiredTrimmedString,
  withDistinctLocations,
  withValidDateRange,
} from "./zodHelpers.js";

const POSITIVE_QUANTITY_TYPES = new Set([
  STOCK_MOVEMENT_TYPE.INBOUND,
  STOCK_MOVEMENT_TYPE.OUTBOUND,
  STOCK_MOVEMENT_TYPE.TRANSFER,
  STOCK_MOVEMENT_TYPE.TRANSFER_MULTI,
  STOCK_MOVEMENT_TYPE.TRANSFER_IN,
  STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
  STOCK_MOVEMENT_TYPE.RETURN,
]);

const MOVEMENT_QTY_RULES = [
  {
    match: (type) => POSITIVE_QUANTITY_TYPES.has(type),
    isInvalid: (qty) => qty <= 0,
    message: "Kuantitas harus lebih dari 0",
  },
  {
    match: (type) => type === STOCK_MOVEMENT_TYPE.OPNAME,
    isInvalid: (qty) => qty < 0,
    message: "Kuantitas opname tidak boleh negatif",
  },
  {
    match: (type) => type === STOCK_MOVEMENT_TYPE.ADJUSTMENT,
    isInvalid: (qty) => qty === 0,
    message: "Kuantitas penyesuaian tidak boleh 0",
  },
];

const baseMovementItemSchema = z.object({
  productId: z.union([z.string(), z.number()]).optional(),
  sku: requiredTrimmedString("SKU wajib diisi"),
  notes: optionalNullableString,
});

const baseBatchLogFilterSchema = z.object({
  startDate: isoDateString("Tanggal mulai wajib diisi"),
  endDate: isoDateString("Tanggal selesai wajib diisi"),
  productName: z.string().optional(),
  movementType: z.string().optional(),
  sourceLocation: z.string().optional(),
  destinationLocation: z.string().optional(),
  userId: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
});

export const stockTransferSchema = withDistinctLocations(
  z.object({
    productId: requiredProductId("Product ID wajib diisi"),
    fromLocationId: requiredPositiveInt("Lokasi asal wajib diisi"),
    toLocationId: requiredPositiveInt("Lokasi tujuan wajib diisi"),
    quantity: requiredPositiveNumber("Kuantitas wajib diisi", "Kuantitas harus lebih dari 0"),
    notes: optionalNullableString,
  }),
);

export const stockAdjustSchema = z.object({
  productId: requiredProductId("Product ID wajib diisi"),
  locationId: requiredPositiveInt("Lokasi wajib diisi"),
  quantity: requiredNonZeroNumber("Kuantitas wajib diisi", "Kuantitas penyesuaian tidak boleh 0"),
  type: z.string().optional(),
  notes: optionalNullableString,
});

export const batchProcessSchema = z
  .object({
    type: z.enum(Object.values(STOCK_MOVEMENT_TYPE), { error: "Tipe batch tidak valid" }),
    fromLocationId: optionalPositiveInt("Lokasi asal harus berupa ID lokasi yang valid"),
    toLocationId: optionalPositiveInt("Lokasi tujuan harus berupa ID lokasi yang valid"),
    notes: optionalNullableString,
    movements: z
      .array(
        baseMovementItemSchema.extend({
          quantity: requiredNumber("Kuantitas wajib diisi"),
          fromLocationId: optionalPositiveInt("Lokasi asal item harus berupa ID lokasi yang valid"),
          toLocationId: optionalPositiveInt("Lokasi tujuan item harus berupa ID lokasi yang valid"),
        }),
      )
      .min(1, "Minimal satu pergerakan stok"),
  })
  .superRefine((data, ctx) => {
    const isTransfer =
      data.type === STOCK_MOVEMENT_TYPE.TRANSFER ||
      data.type === STOCK_MOVEMENT_TYPE.TRANSFER_MULTI;
    const qtyRule = MOVEMENT_QTY_RULES.find((rule) => rule.match(data.type));

    data.movements.forEach((m, index) => {
      if (qtyRule && qtyRule.isInvalid(m.quantity)) {
        ctx.addIssue({
          code: "custom",
          path: ["movements", index, "quantity"],
          message: qtyRule.message,
        });
      }

      if (isTransfer) {
        const effFrom = m.fromLocationId ?? data.fromLocationId;
        const effTo = m.toLocationId ?? data.toLocationId;
        if (effFrom !== undefined && effTo !== undefined && effFrom === effTo) {
          ctx.addIssue({
            code: "custom",
            path: ["movements", index, "toLocationId"],
            message: "Lokasi asal dan tujuan tidak boleh sama",
          });
        }
      }
    });
  });

export const batchTransferSchema = withDistinctLocations(
  z.object({
    fromLocationId: requiredPositiveInt("Lokasi asal wajib diisi"),
    toLocationId: requiredPositiveInt("Lokasi tujuan wajib diisi"),
    movements: z
      .array(
        baseMovementItemSchema.extend({
          quantity: requiredPositiveNumber("Kuantitas wajib diisi", "Kuantitas harus lebih dari 0"),
        }),
      )
      .min(1, "Minimal satu pergerakan stok"),
  }),
);

export const validateReturnSchema = z.object({
  pickingListItemId: requiredPositiveInt("Picking List Item ID wajib diisi"),
  returnToLocationId: requiredPositiveInt("Lokasi retur wajib diisi"),
});

export const batchLogsSchema = withValidDateRange(
  baseBatchLogFilterSchema.extend(paginationQueryShape(50)),
);

export const batchLogExportSchema = withValidDateRange(
  baseBatchLogFilterSchema.extend({
    user: z.union([z.string(), z.number()]).optional(),
    format: z.enum(["xlsx", "csv"]).default("xlsx"),
  }),
).transform(({ user, userId, ...rest }) => ({
  ...rest,
  userId: userId ?? user,
}));

export const productIdParamSchema = createIdParamSchema("productId", "Product ID tidak valid");

export const jobIdParamSchema = createIdParamSchema("id", "Job ID tidak valid");
