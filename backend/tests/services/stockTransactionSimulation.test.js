// backend/tests/services/stockTransactionSimulation.test.js
import { describe, test, expect, jest, beforeEach, afterAll } from "@jest/globals";

/**
 * Stateful In-Memory Transactional Database Simulator
 * Mensimulasikan tabel MariaDB nyata beserta isolasi transaksi (begin/commit/rollback),
 * deteksi double-commit, dan pelacakan jumlah koneksi konkuren.
 */
const createInitialDbState = () => ({
  users: [
    { id: 1, username: "superadmin" },
    { id: 2, username: "staff_gd_a" },
    { id: 3, username: "staff_gd_b" },
  ],
  locations: [
    { id: 10, code: "GD-A", building: "A", floor: "1", name: "Gudang A", purpose: "WAREHOUSE" },
    { id: 20, code: "GD-B", building: "B", floor: "1", name: "Gudang B", purpose: "WAREHOUSE" },
    { id: 30, code: "PJ-1", building: "C", floor: "1", name: "Pajangan 1", purpose: "DISPLAY" },
  ],
  user_locations: [
    { user_id: 2, location_id: 10 },
    { user_id: 3, location_id: 20 },
  ],
  products: [
    { id: 1, sku: "ITEM-A", name: "Produk A", is_package: 0, category_id: null },
    { id: 2, sku: "ITEM-B", name: "Produk B", is_package: 0, category_id: null },
    { id: 3, sku: "PKG-AB", name: "Paket AB", is_package: 1, category_id: null },
  ],
  package_components: [
    { package_product_id: 3, component_product_id: 1, quantity_per_package: 2 },
    { package_product_id: 3, component_product_id: 2, quantity_per_package: 1 },
  ],
  stock_locations: [
    { product_id: 1, location_id: 10, quantity: 10 },
    { product_id: 2, location_id: 10, quantity: 5 },
    { product_id: 2, location_id: 20, quantity: 4 },
  ],
  stock_movements: [],
  stock_requests: [],
  stock_request_items: [],
  picking_list_items: [
    { id: 501, product_id: 1, quantity: 3, status: "RETURNED" },
  ],
  sequences: {
    stock_movements: 1,
    stock_requests: 1,
    stock_request_items: 1,
  },
});

let committedState = createInitialDbState();
let timeline = [];
let activeConnections = 0;
let maxConcurrentConnections = 0;
let totalAcquiredConnections = 0;

const normalizeSql = (sql) => sql.replace(/\s+/g, " ").trim();

const executeSqlOnState = (state, rawSql, params = []) => {
  const sql = normalizeSql(rawSql);

  // 1. user_locations
  if (sql.startsWith("SELECT 1 FROM user_locations")) {
    const [userId, locationId] = params;
    const match = state.user_locations.some(
      (ul) => Number(ul.user_id) === Number(userId) && Number(ul.location_id) === Number(locationId),
    );
    return [match ? [{ 1: 1 }] : [], []];
  }

  // 2. products
  if (sql.includes("FROM products p LEFT JOIN categories c")) {
    const [id] = params;
    const found = state.products.find((p) => Number(p.id) === Number(id));
    return [found ? [{ ...found, category_name: null }] : [], []];
  }

  if (sql.startsWith("SELECT * FROM products WHERE sku IN (?)")) {
    const skuSet = new Set((params[0] || []).map((s) => String(s).toUpperCase()));
    const rows = state.products.filter((p) => skuSet.has(p.sku.toUpperCase()));
    return [rows.map((r) => ({ ...r })), []];
  }

  if (sql.includes("FROM package_components pc JOIN products p")) {
    const pkgIds = new Set((params[0] || []).map(Number));
    const rows = state.package_components
      .filter((pc) => pkgIds.has(Number(pc.package_product_id)))
      .map((pc) => {
        const comp = state.products.find((p) => p.id === pc.component_product_id);
        return {
          ...pc,
          component_sku: comp?.sku,
          component_name: comp?.name,
        };
      });
    return [rows, []];
  }

  // 3. locations & stock_locations
  if (sql.startsWith("SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ?")) {
    const [productId, locationId] = params;
    const row = state.stock_locations.find(
      (sl) => Number(sl.product_id) === Number(productId) && Number(sl.location_id) === Number(locationId),
    );
    return [row ? [{ quantity: row.quantity }] : [], []];
  }

  if (sql.startsWith("UPDATE stock_locations SET quantity = quantity - ?")) {
    const [qty, productId, locationId] = params;
    const row = state.stock_locations.find(
      (sl) => Number(sl.product_id) === Number(productId) && Number(sl.location_id) === Number(locationId),
    );
    if (row) row.quantity -= Number(qty);
    return [{ affectedRows: row ? 1 : 0 }, []];
  }

  if (sql.startsWith("INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?")) {
    const [productId, locationId, qty, incQty] = params;
    const row = state.stock_locations.find(
      (sl) => Number(sl.product_id) === Number(productId) && Number(sl.location_id) === Number(locationId),
    );
    if (row) {
      row.quantity += Number(incQty);
    } else {
      state.stock_locations.push({
        product_id: Number(productId),
        location_id: Number(locationId),
        quantity: Number(qty),
      });
    }
    return [{ affectedRows: 1 }, []];
  }

  if (sql.startsWith("INSERT INTO stock_locations (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE quantity = ?")) {
    const [productId, locationId, newQty, updateQty] = params;
    const row = state.stock_locations.find(
      (sl) => Number(sl.product_id) === Number(productId) && Number(sl.location_id) === Number(locationId),
    );
    if (row) {
      row.quantity = Number(updateQty);
    } else {
      state.stock_locations.push({
        product_id: Number(productId),
        location_id: Number(locationId),
        quantity: Number(newQty),
      });
    }
    return [{ affectedRows: 1 }, []];
  }

  // 4. stock_movements
  if (sql.startsWith("INSERT INTO stock_movements")) {
    const [productId, quantity, fromLocationId, toLocationId, type, userId, notes, createdAt] = params;
    const id = state.sequences.stock_movements++;
    state.stock_movements.push({
      id,
      product_id: Number(productId),
      quantity: Number(quantity),
      from_location_id: fromLocationId ? Number(fromLocationId) : null,
      to_location_id: toLocationId ? Number(toLocationId) : null,
      movement_type: type,
      user_id: Number(userId),
      notes: notes ?? null,
      created_at: createdAt || new Date(),
    });
    return [{ insertId: id, affectedRows: 1 }, []];
  }

  if (sql.startsWith("SELECT COUNT(*) as total FROM stock_movements sm JOIN users u")) {
    const productId = Number(params[0]);
    const count = state.stock_movements.filter((sm) => sm.product_id === productId).length;
    return [[{ total: count }], []];
  }

  if (sql.includes("FROM stock_movements sm JOIN users u ON sm.user_id = u.id LEFT JOIN locations from_loc")) {
    const productId = Number(params[0]);
    const rows = state.stock_movements
      .filter((sm) => sm.product_id === productId)
      .slice()
      .reverse()
      .map((sm) => ({
        id: sm.id,
        quantity: sm.quantity,
        movement_type: sm.movement_type,
        notes: sm.notes,
        created_at: sm.created_at,
        user: state.users.find((u) => u.id === sm.user_id)?.username || null,
        from_location: state.locations.find((l) => l.id === sm.from_location_id)?.code || null,
        to_location: state.locations.find((l) => l.id === sm.to_location_id)?.code || null,
      }));
    return [rows, []];
  }

  if (sql.startsWith("SELECT COUNT(*) as total FROM stock_movements sm JOIN products p")) {
    return [[{ total: state.stock_movements.length }], []];
  }

  if (sql.includes("FROM stock_movements sm JOIN products p ON sm.product_id = p.id")) {
    const rows = state.stock_movements
      .slice()
      .reverse()
      .map((sm) => {
        const prod = state.products.find((p) => p.id === sm.product_id);
        return {
          id: sm.id,
          sku: prod?.sku,
          product_name: prod?.name,
          quantity: sm.quantity,
          movement_type: sm.movement_type,
          notes: sm.notes,
          created_at: sm.created_at,
          user: state.users.find((u) => u.id === sm.user_id)?.username || null,
          from_location: state.locations.find((l) => l.id === sm.from_location_id)?.code || null,
          to_location: state.locations.find((l) => l.id === sm.to_location_id)?.code || null,
        };
      });
    return [rows, []];
  }

  // 5. stock_requests & stock_request_items
  if (sql.startsWith("INSERT INTO stock_requests")) {
    const [requestNumber, type, requesterId, fromLocationId, toLocationId, status, notes] = params;
    const id = state.sequences.stock_requests++;
    state.stock_requests.push({
      id,
      request_number: requestNumber,
      type,
      requester_id: Number(requesterId),
      from_location_id: fromLocationId ? Number(fromLocationId) : null,
      to_location_id: toLocationId ? Number(toLocationId) : null,
      status,
      notes,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return [{ insertId: id, affectedRows: 1 }, []];
  }

  if (sql.startsWith("INSERT INTO stock_request_items")) {
    const rows = params[0] || [];
    for (const [reqId, productId, quantity, receivedQuantity] of rows) {
      state.stock_request_items.push({
        id: state.sequences.stock_request_items++,
        stock_request_id: Number(reqId),
        product_id: Number(productId),
        quantity: Number(quantity),
        received_quantity: Number(receivedQuantity),
      });
    }
    return [{ affectedRows: rows.length }, []];
  }

  if (sql.includes("FROM stock_requests sr LEFT JOIN users u") && sql.includes("WHERE sr.id = ?")) {
    const [id] = params;
    const req = state.stock_requests.find((sr) => Number(sr.id) === Number(id));
    if (!req) return [[], []];
    const fromLoc = state.locations.find((l) => l.id === req.from_location_id);
    const toLoc = state.locations.find((l) => l.id === req.to_location_id);
    const requester = state.users.find((u) => u.id === req.requester_id);
    return [
      [
        {
          ...req,
          requester_name: requester?.username || null,
          from_location_name: fromLoc?.name || null,
          from_location_code: fromLoc?.code || null,
          to_location_name: toLoc?.name || null,
          to_location_code: toLoc?.code || null,
        },
      ],
      [],
    ];
  }

  if (sql.includes("FROM stock_request_items sri JOIN products p")) {
    const [reqId] = params;
    const items = state.stock_request_items
      .filter((sri) => Number(sri.stock_request_id) === Number(reqId))
      .map((sri) => {
        const prod = state.products.find((p) => p.id === sri.product_id);
        return {
          ...sri,
          product_name: prod?.name,
          sku: prod?.sku,
        };
      });
    return [items, []];
  }

  if (sql.startsWith("UPDATE stock_requests SET status = ?")) {
    const [status, id] = params;
    const req = state.stock_requests.find((sr) => Number(sr.id) === Number(id));
    if (req) req.status = status;
    return [{ affectedRows: req ? 1 : 0 }, []];
  }

  if (sql.startsWith("UPDATE stock_request_items SET received_quantity = ?")) {
    const [receivedQty, itemId] = params;
    const item = state.stock_request_items.find((sri) => Number(sri.id) === Number(itemId));
    if (item) item.received_quantity = Number(receivedQty);
    return [{ affectedRows: item ? 1 : 0 }, []];
  }

  // 6. picking_list_items
  if (sql.startsWith("SELECT product_id, quantity FROM picking_list_items WHERE id = ? AND status = 'RETURNED'")) {
    const [itemId] = params;
    const item = state.picking_list_items.find(
      (pli) => Number(pli.id) === Number(itemId) && pli.status === "RETURNED",
    );
    return [item ? [{ product_id: item.product_id, quantity: item.quantity }] : [], []];
  }

  if (sql.startsWith("UPDATE picking_list_items SET status = ? WHERE id = ?")) {
    const [status, itemId] = params;
    const item = state.picking_list_items.find((pli) => Number(pli.id) === Number(itemId));
    if (item) item.status = status;
    return [{ affectedRows: item ? 1 : 0 }, []];
  }

  throw new Error(`Unhandled SQL in simulation DB: ${sql}`);
};

const createSimConnection = () => {
  let inTx = false;
  let txState = null;

  const queryHandler = async (sql, params) => {
    const targetState = inTx ? txState : committedState;
    return executeSqlOnState(targetState, sql, params);
  };

  return {
    beginTransaction: async () => {
      if (inTx) throw new Error("Transaction already active on this connection");
      inTx = true;
      txState = structuredClone(committedState);
      timeline.push("BEGIN");
    },
    commit: async () => {
      if (!inTx) throw new Error("Double commit or commit outside active transaction!");
      committedState = txState;
      txState = null;
      inTx = false;
      timeline.push("COMMIT");
    },
    rollback: async () => {
      if (!inTx) return;
      txState = null;
      inTx = false;
      timeline.push("ROLLBACK");
    },
    release: () => {
      activeConnections = Math.max(0, activeConnections - 1);
      timeline.push("RELEASE");
    },
    query: queryHandler,
    execute: queryHandler,
  };
};

// Mock ONLY db pool & external network side effects (Firebase/Notifications)
await jest.unstable_mockModule("../../config/db.js", () => ({
  default: {
    getConnection: jest.fn(async () => {
      totalAcquiredConnections++;
      activeConnections++;
      if (activeConnections > maxConcurrentConnections) {
        maxConcurrentConnections = activeConnections;
      }
      return createSimConnection();
    }),
  },
}));

await jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: {
    refreshStock: jest.fn(() => {
      timeline.push("SIGNAL:REFRESH_STOCK");
      return Promise.resolve(true);
    }),
    refreshPicking: jest.fn(() => {
      timeline.push("SIGNAL:REFRESH_PICKING");
      return Promise.resolve(true);
    }),
    refreshRequests: jest.fn(() => {
      timeline.push("SIGNAL:REFRESH_REQUESTS");
      return Promise.resolve(true);
    }),
  },
}));

await jest.unstable_mockModule("../../services/notificationService.js", () => ({
  notifyUsersByPermission: jest.fn(async () => {
    timeline.push("NOTIFY:PERMISSION");
  }),
  notifyUsers: jest.fn(async () => {
    timeline.push("NOTIFY:USERS");
  }),
}));

// Import REAL middleware, controllers, validators, services, repositories, and errorHandler
const { validate } = await import("../../middleware/validate.js");
const errorHandler = (await import("../../middleware/errorHandler.js")).default;
const { batchProcessSchema } = await import("../../validators/stockValidator.js");
const stockController = await import("../../controllers/stockController.js");
const stockRequestController = await import("../../controllers/stockRequestController.js");
const { STOCK_MOVEMENT_TYPE, STOCK_REQUEST_STATUS, STOCK_REQUEST_TYPE } = await import(
  "../../config/wmsConstants.js"
);

/**
 * Helper eksekusi pipeline HTTP Express nyata:
 * [validate] -> controller -> errorHandler (dalam mode production)
 */
const runHttpPipeline = async ({ middleware = null, handler, body = {}, query = {}, params = {}, user = { id: 1, role_id: 1 } }) => {
  const req = { body, query, params, user, headers: {} };
  let resolveDone;
  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const res = {
    statusCode: 200,
    headersSent: false,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      resolveDone();
      return this;
    },
  };

  let capturedErr = null;
  const runNext = (err) => {
    if (err) {
      capturedErr = err;
      resolveDone();
    }
  };

  if (middleware) {
    await middleware(req, res, runNext);
  }

  if (!capturedErr) {
    handler(req, res, runNext);
    await donePromise;
  }

  if (capturedErr) {
    errorHandler(capturedErr, req, res, () => {});
  }

  return { status: res.statusCode, body: res.body };
};

const getStock = (productId, locationId) => {
  const row = committedState.stock_locations.find(
    (sl) => sl.product_id === productId && sl.location_id === locationId,
  );
  return row ? row.quantity : 0;
};

describe("End-to-End Transaction Simulations (Real Pipeline + Stateful DB)", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    committedState = createInitialDbState();
    timeline = [];
    activeConnections = 0;
    maxConcurrentConnections = 0;
    totalAcquiredConnections = 0;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test("Simulasi 1: TRANSFER_MULTI ditolak 403 FORBIDDEN & rollback atomik item sebelumnya", async () => {
    const res = await runHttpPipeline({
      middleware: validate(batchProcessSchema),
      handler: stockController.processBatchMovements,
      user: { id: 2, role_id: 2 }, // Hanya punya akses GD-A (10), tidak punya GD-B (20)
      body: {
        type: STOCK_MOVEMENT_TYPE.TRANSFER_MULTI,
        notes: "Transfer campuran",
        movements: [
          { sku: "ITEM-A", quantity: 3, fromLocationId: 10, toLocationId: 30 }, // Valid
          { sku: "ITEM-B", quantity: 1, fromLocationId: 20, toLocationId: 30 }, // Forbidden!
        ],
      },
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: "Akses ditolak untuk lokasi asal SKU 'ITEM-B'.",
      error_code: "FORBIDDEN",
    });

    // Item 1 wajib ikut ter-rollback
    expect(getStock(1, 10)).toBe(10);
    expect(getStock(1, 30)).toBe(0);
    expect(getStock(2, 20)).toBe(4);
    expect(committedState.stock_movements).toHaveLength(0);
    expect(timeline).toEqual(["BEGIN", "ROLLBACK", "RELEASE"]);
  });

  test("Simulasi 2: TRANSFER_MULTI paket PKG-AB + query History & Batch Logs", async () => {
    const transferRes = await runHttpPipeline({
      middleware: validate(batchProcessSchema),
      handler: stockController.processBatchMovements,
      user: { id: 2, role_id: 2 },
      body: {
        type: STOCK_MOVEMENT_TYPE.TRANSFER_MULTI,
        notes: "Kirim ke pajangan",
        movements: [
          { sku: "PKG-AB", quantity: 2, fromLocationId: 10, toLocationId: 30 }, // 4 ITEM-A & 2 ITEM-B
          { sku: "ITEM-A", quantity: 1, fromLocationId: 10, toLocationId: 20 },
        ],
      },
    });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body).toMatchObject({ success: true, count: 3 });

    // Saldo fisik terupdate akurat
    expect(getStock(1, 10)).toBe(5); // 10 - 4 - 1
    expect(getStock(1, 30)).toBe(4);
    expect(getStock(1, 20)).toBe(1);
    expect(getStock(2, 10)).toBe(3); // 5 - 2
    expect(getStock(2, 30)).toBe(2);
    expect(committedState.stock_movements).toHaveLength(3);
    expect(committedState.stock_movements[0].notes).toBe("Kirim ke pajangan [Via PKG-AB]");

    // Timeline wajib COMMIT sebelum SIGNAL/NOTIFY
    const commitIdx = timeline.indexOf("COMMIT");
    expect(commitIdx).toBeGreaterThan(0);
    expect(timeline.indexOf("SIGNAL:REFRESH_STOCK")).toBeGreaterThan(commitIdx);
    expect(timeline.indexOf("NOTIFY:PERMISSION")).toBeGreaterThan(commitIdx);

    // Query riwayat via controller + repository nyata
    const histRes = await runHttpPipeline({
      handler: stockController.getStockHistory,
      params: { productId: 1 },
      query: { page: "1" },
    });
    expect(histRes.status).toBe(200);
    expect(histRes.body.data).toHaveLength(2);
    expect(histRes.body.pagination.total).toBe(2);

    const logRes = await runHttpPipeline({
      handler: stockController.getBatchLogs,
      query: { startDate: "2026-11-01", endDate: "2026-11-30", page: "1", limit: "50" },
    });
    expect(logRes.status).toBe(200);
    expect(logRes.body.data).toHaveLength(3);
  });

  test("Simulasi 3: ADJUSTMENT batch (sukses tambah+kurang berurutan & tolak stok minus Opsi A)", async () => {
    // 3A: +5 lalu -12 pada GD-A (stok awal 10 -> 15 -> 3)
    const okRes = await runHttpPipeline({
      middleware: validate(batchProcessSchema),
      handler: stockController.processBatchMovements,
      user: { id: 2, role_id: 2 },
      body: {
        type: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
        toLocationId: 10,
        notes: "Koreksi selisih",
        movements: [
          { sku: "ITEM-A", quantity: 5 },
          { sku: "ITEM-A", quantity: -12 },
        ],
      },
    });

    expect(okRes.status).toBe(200);
    expect(getStock(1, 10)).toBe(3);
    expect(committedState.stock_movements.map((m) => m.quantity)).toEqual([5, 12]);

    // 3B: PKG-AB -4 (butuh 8 ITEM-A sementara stok tinggal 3) -> harus ditolak 400
    const failRes = await runHttpPipeline({
      middleware: validate(batchProcessSchema),
      handler: stockController.processBatchMovements,
      user: { id: 2, role_id: 2 },
      body: {
        type: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
        toLocationId: 10,
        notes: "Koreksi over",
        movements: [{ sku: "PKG-AB", quantity: -4 }],
      },
    });

    expect(failRes.status).toBe(400);
    expect(failRes.body).toEqual({
      success: false,
      message: "Stok SKU 'ITEM-A' tidak cukup untuk dikurangi. Ada: 3, Butuh: 8.",
      error_code: "INSUFFICIENT_STOCK",
    });
    expect(getStock(1, 10)).toBe(3);
  });

  test("Simulasi 4: Validasi Zod menolak payload kosong tanpa menyentuh DB", async () => {
    const res = await runHttpPipeline({
      middleware: validate(batchProcessSchema),
      handler: stockController.processBatchMovements,
      body: {
        type: STOCK_MOVEMENT_TYPE.INBOUND,
        toLocationId: 10,
        movements: [],
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toContain("Minimal satu pergerakan stok");
    expect(totalAcquiredConnections).toBe(0);
  });

  test("Simulasi 5: Siklus penuh Stock Request Transfer (Create -> Self-Approve 403 -> Approve -> Dispatch -> Partial Complete)", async () => {
    // 1. Staff B buat request dari GD-A (10) ke GD-B (20)
    const createRes = await runHttpPipeline({
      handler: stockRequestController.createStockRequest,
      user: { id: 3, role_id: 2 },
      body: {
        type: STOCK_REQUEST_TYPE.TRANSFER,
        fromLocationId: 10,
        toLocationId: 20,
        notes: "Minta stok ITEM-A",
        items: [{ productId: 1, quantity: 4 }],
      },
    });
    expect(createRes.status).toBe(200);
    const reqId = createRes.body.requestId;

    // 2. Staff B coba approve request sendiri -> 403 FORBIDDEN
    const selfApproveRes = await runHttpPipeline({
      handler: stockRequestController.approveStockRequest,
      params: { id: reqId },
      user: { id: 3, role_id: 2 },
    });
    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body).toEqual({
      success: false,
      message: "Anda tidak dapat menyetujui permintaan Anda sendiri.",
      error_code: "FORBIDDEN",
    });

    // 3. Staff A approve
    const approveRes = await runHttpPipeline({
      handler: stockRequestController.approveStockRequest,
      params: { id: reqId },
      user: { id: 2, role_id: 2 },
    });
    expect(approveRes.status).toBe(200);
    expect(committedState.stock_requests[0].status).toBe(STOCK_REQUEST_STATUS.APPROVED);
    expect(getStock(1, 10)).toBe(10); // Belum dipotong saat approve

    // 4. Staff A dispatch (koneksi tunggal ACID!)
    timeline = [];
    maxConcurrentConnections = 0;
    const dispatchRes = await runHttpPipeline({
      handler: stockRequestController.dispatchStockRequest,
      params: { id: reqId },
      user: { id: 2, role_id: 2 },
    });
    expect(dispatchRes.status).toBe(200);
    expect(maxConcurrentConnections).toBe(1);
    expect(committedState.stock_requests[0].status).toBe(STOCK_REQUEST_STATUS.SHIPPED);
    expect(getStock(1, 10)).toBe(6); // 10 - 4
    expect(timeline.indexOf("COMMIT")).toBeLessThan(timeline.indexOf("SIGNAL:REFRESH_STOCK"));

    // 5. Staff B terima parsial (terima 3 dari 4)
    maxConcurrentConnections = 0;
    const completeRes = await runHttpPipeline({
      handler: stockRequestController.completeStockRequest,
      params: { id: reqId },
      user: { id: 3, role_id: 2 },
      body: { receivedItems: [{ productId: 1, receivedQuantity: 3 }] },
    });
    expect(completeRes.status).toBe(200);
    expect(maxConcurrentConnections).toBe(1);
    expect(committedState.stock_requests[0].status).toBe(STOCK_REQUEST_STATUS.COMPLETED);
    expect(committedState.stock_request_items[0].received_quantity).toBe(3);
    expect(getStock(1, 20)).toBe(3);
  });

  test("Simulasi 6: Rollback Stock Request Dispatch saat stok asal tidak cukup (status tetap APPROVED)", async () => {
    const createRes = await runHttpPipeline({
      handler: stockRequestController.createStockRequest,
      user: { id: 3, role_id: 2 },
      body: {
        type: STOCK_REQUEST_TYPE.TRANSFER,
        fromLocationId: 10,
        toLocationId: 20,
        notes: "Minta terlalu banyak",
        items: [{ productId: 1, quantity: 50 }],
      },
    });
    const reqId = createRes.body.requestId;

    await runHttpPipeline({
      handler: stockRequestController.approveStockRequest,
      params: { id: reqId },
      user: { id: 2, role_id: 2 },
    });

    maxConcurrentConnections = 0;
    const dispatchFail = await runHttpPipeline({
      handler: stockRequestController.dispatchStockRequest,
      params: { id: reqId },
      user: { id: 2, role_id: 2 },
    });

    expect(dispatchFail.status).toBe(400);
    expect(dispatchFail.body).toEqual({
      success: false,
      message: "Stok SKU 'ITEM-A' kurang. Ada: 10, Butuh: 50.",
      error_code: "INSUFFICIENT_STOCK",
    });
    expect(maxConcurrentConnections).toBe(1);
    expect(committedState.stock_requests[0].status).toBe(STOCK_REQUEST_STATUS.APPROVED);
    expect(getStock(1, 10)).toBe(10);
  });

  test("Simulasi 7: Siklus Stock Request STOCK_OPNAME (sukses single-connection & tolak opname paket)", async () => {
    // 7A: Opname ITEM-B di GD-B (stok awal 4 -> actual 15, selisih 11)
    const reqOk = await runHttpPipeline({
      handler: stockRequestController.createStockRequest,
      user: { id: 2, role_id: 2 },
      body: {
        type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
        toLocationId: 20,
        notes: "Opname GD-B",
        items: [{ productId: 2, quantity: 15 }],
      },
    });

    maxConcurrentConnections = 0;
    timeline = [];
    const approveOk = await runHttpPipeline({
      handler: stockRequestController.approveStockRequest,
      params: { id: reqOk.body.requestId },
      user: { id: 3, role_id: 2 },
    });

    expect(approveOk.status).toBe(200);
    expect(maxConcurrentConnections).toBe(1);
    expect(committedState.stock_requests[0].status).toBe(STOCK_REQUEST_STATUS.COMPLETED);
    expect(getStock(2, 20)).toBe(15);
    expect(committedState.stock_movements[0]).toMatchObject({
      product_id: 2,
      quantity: 11,
      to_location_id: 20,
      movement_type: STOCK_MOVEMENT_TYPE.OPNAME,
    });
    expect(timeline.indexOf("COMMIT")).toBeLessThan(timeline.indexOf("SIGNAL:REFRESH_STOCK"));

    // 7B: Opname paket PKG-AB harus ditolak 400 dan status tetap PENDING
    const reqPkg = await runHttpPipeline({
      handler: stockRequestController.createStockRequest,
      user: { id: 2, role_id: 2 },
      body: {
        type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
        toLocationId: 20,
        notes: "Salah opname paket",
        items: [{ productId: 3, quantity: 5 }],
      },
    });

    const approvePkgFail = await runHttpPipeline({
      handler: stockRequestController.approveStockRequest,
      params: { id: reqPkg.body.requestId },
      user: { id: 3, role_id: 2 },
    });

    expect(approvePkgFail.status).toBe(400);
    expect(approvePkgFail.body.error_code).toBe("VALIDATION_ERROR");
    expect(committedState.stock_requests[1].status).toBe(STOCK_REQUEST_STATUS.PENDING);
  });

  test("Simulasi 8: validateReturn (sukses + double-validate 404) & bulkActionStockRequest mixed result", async () => {
    // 8A: Validasi retur pertama sukses, kedua kali harus ditolak 404 NOT_FOUND
    const ret1 = await runHttpPipeline({
      handler: stockController.validateReturn,
      user: { id: 2, role_id: 2 },
      body: { pickingListItemId: 501, returnToLocationId: 10 },
    });
    expect(ret1.status).toBe(200);
    expect(getStock(1, 10)).toBe(13); // 10 + 3
    expect(committedState.picking_list_items[0].status).toBe("COMPLETED_RETURN");

    const ret2 = await runHttpPipeline({
      handler: stockController.validateReturn,
      user: { id: 2, role_id: 2 },
      body: { pickingListItemId: 501, returnToLocationId: 10 },
    });
    expect(ret2.status).toBe(404);
    expect(ret2.body.error_code).toBe("NOT_FOUND");

    // 8B: Bulk action: 1 milik user lain (sukses), 1 milik sendiri (gagal self-approval)
    const r1 = await runHttpPipeline({
      handler: stockRequestController.createStockRequest,
      user: { id: 3, role_id: 2 },
      body: {
        type: STOCK_REQUEST_TYPE.TRANSFER,
        fromLocationId: 10,
        toLocationId: 20,
        notes: "Req valid",
        items: [{ productId: 1, quantity: 1 }],
      },
    });
    const r2 = await runHttpPipeline({
      handler: stockRequestController.createStockRequest,
      user: { id: 2, role_id: 2 },
      body: {
        type: STOCK_REQUEST_TYPE.TRANSFER,
        fromLocationId: 10,
        toLocationId: 20,
        notes: "Req sendiri",
        items: [{ productId: 1, quantity: 1 }],
      },
    });

    const bulkRes = await runHttpPipeline({
      handler: stockRequestController.bulkActionStockRequest,
      user: { id: 2, role_id: 2 },
      body: { action: "APPROVE", requestIds: [r1.body.requestId, r2.body.requestId] },
    });

    expect(bulkRes.status).toBe(200);
    expect(bulkRes.body.data).toEqual({
      successCount: 1,
      failedCount: 1,
      details: [
        { id: r1.body.requestId, status: "success" },
        {
          id: r2.body.requestId,
          status: "failed",
          reason: "Anda tidak dapat menyetujui permintaan Anda sendiri.",
        },
      ],
    });
  });
});
