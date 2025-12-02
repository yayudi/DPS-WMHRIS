// backend/services/pickingImportService.js
import db from "../config/db.js";
import { WMS_STATUS, MP_STATUS } from "../config/wmsConstants.js";

const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const safe = (val) => (val === undefined ? null : val);

// [HELPER] Ambil info Paket & Komponen dari DB dalam sekali jalan
const fetchProductMap = async (connection, skuList) => {
  if (!skuList || skuList.length === 0) return new Map();

  const placeholders = skuList.map(() => "?").join(",");

  // 1. Ambil Info Produk Dasar (Cek is_package)
  const [products] = await connection.query(
    `SELECT id, sku, is_package FROM products WHERE sku IN (${placeholders})`,
    skuList
  );

  const productMap = new Map();
  const packageIds = [];

  products.forEach((p) => {
    productMap.set(p.sku, {
      id: p.id,
      is_package: p.is_package === 1,
      components: [],
    });
    if (p.is_package === 1) packageIds.push(p.id);
  });

  // 2. Jika ada paket, ambil komponennya
  if (packageIds.length > 0) {
    const pkgPlaceholders = packageIds.map(() => "?").join(",");
    const [components] = await connection.query(
      `SELECT
                pc.package_product_id,
                pc.component_product_id,
                pc.quantity_per_package,
                p.sku as component_sku
             FROM package_components pc
             JOIN products p ON pc.component_product_id = p.id
             WHERE pc.package_product_id IN (${pkgPlaceholders})`,
      packageIds
    );

    // Map komponen ke parent paket
    components.forEach((c) => {
      // Cari SKU parent berdasarkan ID
      for (const [sku, data] of productMap.entries()) {
        if (data.id === c.package_product_id) {
          data.components.push({
            id: c.component_product_id,
            sku: c.component_sku,
            qty_ratio: c.quantity_per_package,
          });
          break;
        }
      }
    });
  }

  return productMap;
};

export const processImportData = async (parsedOrders, userId) => {
  const results = { processed: 0, new: 0, updated: 0, errors: [] };

  // [OPTIMASI] Kumpulkan semua SKU unik untuk pre-fetch
  const allSkus = new Set();
  for (const orderData of parsedOrders.values()) {
    orderData.items.forEach((i) => allSkus.add(i.sku));
  }

  // Gunakan koneksi pool biasa untuk read-only prefetch (biar cepat)
  const productInfoMap = await fetchProductMap(db, Array.from(allSkus));

  // Mulai Transaksi
  for (const [invoiceId, orderData] of parsedOrders) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // STEP 0: Cek Data Existing
      const [existing] = await connection.execute(
        `SELECT id, status FROM picking_lists WHERE original_invoice_id = ?`,
        [safe(invoiceId)]
      );

      const isExists = existing.length > 0;
      const mpStatus = safe(orderData.status) || MP_STATUS.NEW;
      const isMpCancel = mpStatus === MP_STATUS.CANCELLED || mpStatus === MP_STATUS.RETURNED;

      // ============================================================
      // SKENARIO 1: DATA BARU (INSERT)
      // ============================================================
      if (!isExists) {
        const initialWmsStatus = isMpCancel ? WMS_STATUS.CANCEL : WMS_STATUS.PENDING;

        // 1. Insert Header
        const [res] = await connection.execute(
          `INSERT INTO picking_lists
                    (user_id, source, original_invoice_id, customer_name, order_date, status, marketplace_status, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            safe(userId),
            safe(orderData.source || "Tokopedia"),
            safe(invoiceId),
            safe(orderData.customer),
            safe(orderData.orderDate) || now(),
            safe(initialWmsStatus),
            safe(mpStatus),
            now(),
          ]
        );

        const newPickingId = res.insertId;

        // 2. Insert Items (Dengan Logika Pecah Paket)
        for (const item of orderData.items) {
          const productInfo = productInfoMap.get(item.sku);

          // Tentukan item apa saja yang harus di-insert
          let itemsToInsert = [];

          if (productInfo && productInfo.is_package && productInfo.components.length > 0) {
            // KASUS PAKET: Insert Komponennya
            itemsToInsert = productInfo.components.map((comp) => ({
              productId: comp.id,
              sku: comp.sku,
              // Qty = Qty Paket di Order * Ratio Komponen
              qty: item.qty * comp.qty_ratio,
            }));
          } else {
            // KASUS SINGLE / PRODUK TAK DIKENAL: Insert apa adanya
            // Jika productInfo null (tidak ada di DB), tetap coba insert (nanti subquery p.id akan null, perlu handle)
            itemsToInsert = [
              {
                productId: productInfo ? productInfo.id : null,
                sku: item.sku,
                qty: item.qty,
              },
            ];
          }

          // Loop insert untuk setiap pecahan item (atau item tunggal)
          for (const subItem of itemsToInsert) {
            const [result] = await connection.execute(
              `INSERT INTO picking_list_items
                (picking_list_id, product_id, original_sku, quantity, status, suggested_location_id)
                  SELECT
                    ?,      -- [1] picking_list_id
                    p.id,   -- product_id (Ambil dari DB lagi untuk keamanan)
                    ?,      -- [2] original_sku (SKU Komponen/Item)
                    ?,      -- [3] quantity
                    ?,      -- [4] status
                    -- [LOGIKA AUTO-SUGGEST PRIORITAS LANTAI] --
                    (
                      SELECT sl.location_id
                      FROM stock_locations sl
                      JOIN locations l ON sl.location_id = l.id
                      WHERE sl.product_id = p.id
                        AND l.purpose = 'DISPLAY'
                        AND sl.quantity > 0
                      ORDER BY
                        CASE
                          WHEN l.floor IN (1, 2) AND sl.quantity >= ? THEN 1
                          WHEN sl.quantity >= ? THEN 2
                          WHEN l.floor IN (1, 2) THEN 3
                          ELSE 4
                        END ASC,
                        sl.quantity DESC
                      LIMIT 1
                    ) as suggested_loc
                  FROM products p
                  WHERE p.sku = ? -- [7] Match SKU Komponen/Item
                  LIMIT 1`,
              [
                newPickingId,
                safe(subItem.sku),
                safe(subItem.qty),
                safe(initialWmsStatus),
                safe(subItem.qty), // [5] Prioritas Qty
                safe(subItem.qty), // [6] Prioritas Qty
                safe(subItem.sku), // [7]
              ]
            );

            if (result.affectedRows === 0) {
              throw new Error(`SKU '${subItem.sku}' tidak terdaftar di Master Produk.`);
            }
          }
        }

        results.new++;
      }

      // ============================================================
      // SKENARIO 2: DATA LAMA (UPDATE)
      // ============================================================
      else {
        const currentId = existing[0].id;

        if (isMpCancel) {
          await connection.execute(
            `UPDATE picking_lists SET marketplace_status = ?, status = ? WHERE id = ?`,
            [safe(mpStatus), WMS_STATUS.CANCEL, currentId]
          );
          await connection.execute(
            `UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`,
            [WMS_STATUS.CANCEL, currentId]
          );
        } else {
          await connection.execute(`UPDATE picking_lists SET marketplace_status = ? WHERE id = ?`, [
            safe(mpStatus),
            currentId,
          ]);
        }
        results.updated++;
      }

      await connection.commit();
      results.processed++;
    } catch (error) {
      await connection.rollback();
      const errorMsg =
        error.code === "ER_BAD_NULL_ERROR" ? "Data Wajib (Not Null) Kosong" : error.message;
      results.errors.push({ invoice: invoiceId, error: errorMsg });
      console.error(`Error processing invoice ${invoiceId}:`, error);
    } finally {
      connection.release();
    }
  }

  return results;
};
