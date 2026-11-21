import { STOCK_REQUEST_STATUS, STOCK_REQUEST_TYPE } from "../../config/wmsConstants.js";
import {
  bulkActionStockRequestSchema,
  completeStockRequestSchema,
  createStockRequestSchema,
  getStockRequestsQuerySchema,
  stockRequestIdParamSchema,
} from "../../validators/stockRequestValidator.js";

describe("stockRequestValidator", () => {
  describe("getStockRequestsQuerySchema", () => {
    it("menerima filter valid dan membersihkan status string kosong", () => {
      const parsed = getStockRequestsQuerySchema.parse({
        status: "",
        fromLocationId: "2",
        page: "2",
        limit: "",
      });
      expect(parsed.status).toBeUndefined();
      expect(parsed.fromLocationId).toBe(2);
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
    });

    it("menerima enum STOCK_REQUEST_STATUS valid dan menolak status ilegal", () => {
      expect(
        getStockRequestsQuerySchema.safeParse({ status: STOCK_REQUEST_STATUS.PENDING }).success,
      ).toBe(true);
      expect(getStockRequestsQuerySchema.safeParse({ status: "UNKNOWN" }).success).toBe(false);
    });
  });

  describe("createStockRequestSchema", () => {
    it("menerima payload TRANSFER valid dan memakai default TRANSFER jika type tidak dikirim", () => {
      const res = createStockRequestSchema.safeParse({
        fromLocationId: 1,
        toLocationId: 2,
        items: [{ productId: 10, quantity: 5 }],
      });
      expect(res.success).toBe(true);
      expect(res.data.type).toBe(STOCK_REQUEST_TYPE.TRANSFER);
    });

    it("menolak TRANSFER jika lokasi kurang, sama, atau quantity <= 0", () => {
      expect(
        createStockRequestSchema.safeParse({
          type: STOCK_REQUEST_TYPE.TRANSFER,
          fromLocationId: null,
          toLocationId: 2,
          items: [{ productId: 10, quantity: 5 }],
        }).success,
      ).toBe(false);

      const sameLoc = createStockRequestSchema.safeParse({
        type: STOCK_REQUEST_TYPE.TRANSFER,
        fromLocationId: 3,
        toLocationId: 3,
        items: [{ productId: 10, quantity: 5 }],
      });
      expect(sameLoc.success).toBe(false);
      expect(sameLoc.error.issues[0].path).toEqual(["toLocationId"]);

      const zeroQty = createStockRequestSchema.safeParse({
        type: STOCK_REQUEST_TYPE.TRANSFER,
        fromLocationId: 1,
        toLocationId: 2,
        items: [{ productId: 10, quantity: 0 }],
      });
      expect(zeroQty.success).toBe(false);
      expect(zeroQty.error.issues[0].path).toEqual(["items", 0, "quantity"]);
    });

    it("menerima STOCK_OPNAME dengan fromLocationId null dan item quantity 0", () => {
      const res = createStockRequestSchema.safeParse({
        type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
        fromLocationId: null,
        toLocationId: 4,
        notes: "Opname mingguan",
        items: [{ productId: 10, quantity: 0 }],
      });
      expect(res.success).toBe(true);
      expect(res.data.fromLocationId).toBeUndefined();

      expect(
        createStockRequestSchema.safeParse({
          type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
          toLocationId: 4,
          items: [{ productId: 10, quantity: -1 }],
        }).success,
      ).toBe(false);

      expect(
        createStockRequestSchema.safeParse({
          type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
          items: [{ productId: 10, quantity: 1 }],
        }).success,
      ).toBe(false);
    });
  });

  describe("completeStockRequestSchema & bulkActionStockRequestSchema & params", () => {
    it("completeStockRequestSchema mendukung receivedItems qty >= 0, null/kosong, dan body undefined", () => {
      expect(
        completeStockRequestSchema.safeParse({
          receivedItems: [{ productId: "5", receivedQuantity: "0" }],
        }).success,
      ).toBe(true);
      expect(completeStockRequestSchema.safeParse({ receivedItems: null }).success).toBe(true);
      expect(completeStockRequestSchema.safeParse({}).success).toBe(true);
      expect(completeStockRequestSchema.safeParse(undefined)).toEqual({ success: true, data: {} });
      expect(completeStockRequestSchema.safeParse("invalid-body").success).toBe(false);
      expect(
        completeStockRequestSchema.safeParse({
          receivedItems: [{ productId: 5, receivedQuantity: -1 }],
        }).success,
      ).toBe(false);
    });

    it("bulkActionStockRequestSchema hanya menerima APPROVE/REJECT dan requestIds non-kosong", () => {
      expect(
        bulkActionStockRequestSchema.safeParse({ action: "APPROVE", requestIds: [1, "2"] }).success,
      ).toBe(true);
      expect(
        bulkActionStockRequestSchema.safeParse({ action: "DELETE", requestIds: [1] }).success,
      ).toBe(false);
      expect(
        bulkActionStockRequestSchema.safeParse({ action: "REJECT", requestIds: [] }).success,
      ).toBe(false);
    });

    it("stockRequestIdParamSchema memvalidasi param id", () => {
      expect(stockRequestIdParamSchema.parse({ id: "19" })).toEqual({ id: 19 });
      expect(stockRequestIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
      expect(stockRequestIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
    });
  });
});
