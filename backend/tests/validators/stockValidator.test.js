import {
  createIdParamSchema,
  emptyToNull,
  emptyToUndefined,
  isoDateString,
  nullablePositiveInt,
  optionalPositiveInt,
  paginationQueryShape,
  requiredNonNegativeNumber,
  requiredNonZeroNumber,
  requiredNumber,
  requiredPositiveInt,
  requiredPositiveNumber,
  requiredProductId,
  requiredTrimmedString,
  withDistinctLocations,
  withValidDateRange,
} from "../../validators/zodHelpers.js";
import {
  batchLogExportSchema,
  batchLogsSchema,
  batchProcessSchema,
  batchTransferSchema,
  jobIdParamSchema,
  productIdParamSchema,
  stockAdjustSchema,
  stockTransferSchema,
  validateReturnSchema,
} from "../../validators/stockValidator.js";
import { STOCK_MOVEMENT_TYPE } from "../../config/wmsConstants.js";
import { z } from "zod";

describe("zodHelpers", () => {
  it("emptyToUndefined & emptyToNull membersihkan string kosong dan whitespace", () => {
    expect(emptyToUndefined(null)).toBeUndefined();
    expect(emptyToUndefined(undefined)).toBeUndefined();
    expect(emptyToUndefined("")).toBeUndefined();
    expect(emptyToUndefined("   ")).toBeUndefined();
    expect(emptyToUndefined("  ABC  ")).toBe("ABC");
    expect(emptyToUndefined(10)).toBe(10);

    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull("   ")).toBeNull();
    expect(emptyToNull("  XYZ ")).toBe("XYZ");
    expect(emptyToNull(5)).toBe(5);
  });

  it("requiredPositiveInt & optionalPositiveInt mencegah coercion null/empty/boolean menjadi 0 atau 1", () => {
    const reqInt = requiredPositiveInt("Wajib ID");
    expect(reqInt.safeParse("12").data).toBe(12);
    expect(reqInt.safeParse(7).data).toBe(7);

    for (const invalid of [null, undefined, "", "   ", 0, -3, 1.5, "abc", true, false]) {
      const res = reqInt.safeParse(invalid);
      expect(res.success).toBe(false);
      expect(res.error.issues[0].message).toBe("Wajib ID");
    }

    const optInt = optionalPositiveInt("Opsional invalid");
    expect(optInt.safeParse(null).data).toBeUndefined();
    expect(optInt.safeParse("").data).toBeUndefined();
    expect(optInt.safeParse("  ").data).toBeUndefined();
    expect(optInt.safeParse(undefined).data).toBeUndefined();
    expect(optInt.safeParse("9").data).toBe(9);
    expect(optInt.safeParse(0).success).toBe(false);
    expect(optInt.safeParse(true).success).toBe(false);
  });

  it("nullablePositiveInt memetakan empty string -> null dan mempertahankan undefined", () => {
    const schema = nullablePositiveInt("Category invalid");
    expect(schema.safeParse(undefined).data).toBeUndefined();
    expect(schema.safeParse(null).data).toBeNull();
    expect(schema.safeParse("").data).toBeNull();
    expect(schema.safeParse("  ").data).toBeNull();
    expect(schema.safeParse("15").data).toBe(15);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(false).success).toBe(false);
  });

  it("helper numerik dan string serta pagination berjalan sesuai kontrak", () => {
    expect(requiredNumber("Num wajib").safeParse("-4.5").data).toBe(-4.5);
    expect(requiredNumber("Num wajib").safeParse("").error.issues[0].message).toBe("Num wajib");

    expect(requiredPositiveNumber("Wajib", "Harus > 0").safeParse(0.5).success).toBe(true);
    expect(requiredPositiveNumber("Wajib", "Harus > 0").safeParse(0).error.issues[0].message).toBe(
      "Harus > 0",
    );

    expect(requiredNonNegativeNumber("Wajib", "Minimal 0").safeParse(0).success).toBe(true);
    expect(requiredNonNegativeNumber("Wajib", "Minimal 0").safeParse(-1).error.issues[0].message).toBe(
      "Minimal 0",
    );

    expect(requiredNonZeroNumber("Wajib", "Tidak 0").safeParse(-2).success).toBe(true);
    expect(requiredNonZeroNumber("Wajib", "Tidak 0").safeParse(0).error.issues[0].message).toBe(
      "Tidak 0",
    );

    expect(requiredProductId("PID wajib").safeParse(" 99 ").data).toBe("99");
    expect(requiredProductId("PID wajib").safeParse(99).data).toBe(99);
    expect(requiredProductId("PID wajib").safeParse("   ").success).toBe(false);
    expect(requiredProductId("PID wajib").safeParse(0).success).toBe(false);

    expect(requiredTrimmedString("Str wajib").safeParse("  SKU-1 ").data).toBe("SKU-1");
    expect(isoDateString("Tgl wajib", "Format salah").safeParse("2026-11-21").success).toBe(true);
    expect(isoDateString("Tgl wajib", "Format salah").safeParse("21-11-2026").error.issues[0].message).toBe(
      "Format salah",
    );

    const pagSchema = z.object(paginationQueryShape(25));
    expect(pagSchema.parse({ page: "", limit: undefined })).toEqual({ page: 1, limit: 25 });

    const paramSchema = createIdParamSchema("itemId", "Item ID invalid");
    expect(paramSchema.parse({ itemId: "42" })).toEqual({ itemId: 42 });
    expect(paramSchema.safeParse({ itemId: "0" }).success).toBe(false);
  });

  it("withDistinctLocations & withValidDateRange menolak konflik lokasi/tanggal", () => {
    const locSchema = withDistinctLocations(
      z.object({ fromLocationId: z.number(), toLocationId: z.number() }),
    );
    expect(locSchema.safeParse({ fromLocationId: 1, toLocationId: 1 }).success).toBe(false);
    expect(locSchema.safeParse({ fromLocationId: 1, toLocationId: 2 }).success).toBe(true);

    const rangeSchema = withValidDateRange(
      z.object({ startDate: isoDateString(), endDate: isoDateString() }),
    );
    expect(rangeSchema.safeParse({ startDate: "2026-11-22", endDate: "2026-11-21" }).success).toBe(
      false,
    );
    expect(rangeSchema.safeParse({ startDate: "2026-11-21", endDate: "2026-11-21" }).success).toBe(
      true,
    );

    expect(() => withDistinctLocations(null)).toThrow(TypeError);
    expect(() => withValidDateRange(null)).toThrow(TypeError);
    expect(() => withValidDateRange({})).toThrow(TypeError);
  });
});

describe("stockValidator", () => {
  it("stockTransferSchema menolak lokasi sama, kuantitas <= 0, dan productId kosong", () => {
    const ok = stockTransferSchema.safeParse({
      productId: "10",
      fromLocationId: "1",
      toLocationId: 2,
      quantity: "5",
      notes: null,
    });
    expect(ok.success).toBe(true);
    expect(ok.data.fromLocationId).toBe(1);

    const sameLoc = stockTransferSchema.safeParse({
      productId: 10,
      fromLocationId: 1,
      toLocationId: 1,
      quantity: 5,
    });
    expect(sameLoc.success).toBe(false);
    expect(sameLoc.error.issues[0].path).toEqual(["toLocationId"]);

    expect(
      stockTransferSchema.safeParse({
        productId: 10,
        fromLocationId: 1,
        toLocationId: 2,
        quantity: 0,
      }).success,
    ).toBe(false);
  });

  it("stockAdjustSchema menerima angka negatif/positif tetapi menolak 0", () => {
    expect(stockAdjustSchema.safeParse({ productId: 1, locationId: 2, quantity: -5 }).success).toBe(
      true,
    );
    expect(stockAdjustSchema.safeParse({ productId: 1, locationId: 2, quantity: 0 }).success).toBe(
      false,
    );
  });

  it("batchProcessSchema mengubah null location menjadi undefined dan menegakkan aturan per tipe", () => {
    const inbound = batchProcessSchema.safeParse({
      type: STOCK_MOVEMENT_TYPE.INBOUND,
      fromLocationId: null,
      toLocationId: 3,
      movements: [{ sku: " SKU-1 ", quantity: "10" }],
    });
    expect(inbound.success).toBe(true);
    expect(inbound.data.fromLocationId).toBeUndefined();
    expect(inbound.data.movements[0].sku).toBe("SKU-1");

    expect(
      batchProcessSchema.safeParse({
        type: "INVALID_TYPE",
        movements: [{ sku: "A", quantity: 1 }],
      }).success,
    ).toBe(false);

    expect(
      batchProcessSchema.safeParse({
        type: STOCK_MOVEMENT_TYPE.INBOUND,
        toLocationId: 3,
        movements: [{ sku: "   ", quantity: 5 }],
      }).success,
    ).toBe(false);

    expect(
      batchProcessSchema.safeParse({
        type: STOCK_MOVEMENT_TYPE.OUTBOUND,
        fromLocationId: 1,
        movements: [{ sku: "A", quantity: 0 }],
      }).success,
    ).toBe(false);

    expect(
      batchProcessSchema.safeParse({
        type: STOCK_MOVEMENT_TYPE.OPNAME,
        toLocationId: 2,
        movements: [{ sku: "A", quantity: 0 }],
      }).success,
    ).toBe(true);

    expect(
      batchProcessSchema.safeParse({
        type: STOCK_MOVEMENT_TYPE.OPNAME,
        toLocationId: 2,
        movements: [{ sku: "A", quantity: -1 }],
      }).success,
    ).toBe(false);

    expect(
      batchProcessSchema.safeParse({
        type: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
        toLocationId: 2,
        movements: [{ sku: "A", quantity: -4 }],
      }).success,
    ).toBe(true);

    expect(
      batchProcessSchema.safeParse({
        type: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
        toLocationId: 2,
        movements: [{ sku: "A", quantity: 0 }],
      }).success,
    ).toBe(false);

    const conflictTransfer = batchProcessSchema.safeParse({
      type: STOCK_MOVEMENT_TYPE.TRANSFER,
      fromLocationId: 4,
      toLocationId: 4,
      movements: [{ sku: "A", quantity: 2 }],
    });
    expect(conflictTransfer.success).toBe(false);
    expect(conflictTransfer.error.issues[0].path).toEqual(["movements", 0, "toLocationId"]);
  });

  it("batchTransferSchema & validateReturnSchema memvalidasi lokasi dan kuantitas", () => {
    expect(
      batchTransferSchema.safeParse({
        fromLocationId: 1,
        toLocationId: 1,
        movements: [{ sku: "A", quantity: 5 }],
      }).success,
    ).toBe(false);

    expect(
      batchTransferSchema.safeParse({
        fromLocationId: 1,
        toLocationId: 2,
        movements: [{ sku: "A", quantity: 5 }],
      }).success,
    ).toBe(true);

    const badRet = validateReturnSchema.safeParse({ pickingListItemId: "", returnToLocationId: 2 });
    expect(badRet.success).toBe(false);
    expect(badRet.error.issues[0].message).toBe("Picking List Item ID wajib diisi");
  });

  it("batchLogsSchema, batchLogExportSchema, dan param schemas bekerja sesuai kontrak", () => {
    const logsOk = batchLogsSchema.parse({ startDate: "2026-11-01", endDate: "2026-11-21" });
    expect(logsOk.page).toBe(1);
    expect(logsOk.limit).toBe(50);

    expect(
      batchLogsSchema.safeParse({ startDate: "2026-11-25", endDate: "2026-11-21" }).success,
    ).toBe(false);

    const exportFromUser = batchLogExportSchema.parse({
      startDate: "2026-11-01",
      endDate: "2026-11-21",
      user: "admin",
    });
    expect(exportFromUser.userId).toBe("admin");
    expect(exportFromUser.format).toBe("xlsx");

    const exportPreferUserId = batchLogExportSchema.parse({
      startDate: "2026-11-01",
      endDate: "2026-11-21",
      user: "legacy",
      userId: 99,
      format: "csv",
    });
    expect(exportPreferUserId.userId).toBe(99);

    expect(productIdParamSchema.parse({ productId: "12" })).toEqual({ productId: 12 });
    expect(jobIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});
