// backend\services\importSyncService.js
const DBLayer = {
  async getPackageComponents(connection, packageProductId) {
    const [rows] = await connection.query(
      `SELECT pc.component_product_id, pc.quantity_per_package
       FROM package_components pc
       WHERE pc.package_product_id = ?`,
      [packageProductId]
    );
    return rows;
  },

  async findPickingLocations(connection, productId, qty) {
    // Using 'DISPLAY' location by default
    const [stock] = await connection.query(
      `SELECT sl.location_id, sl.quantity
       FROM stock_locations sl
       JOIN locations l ON sl.location_id = l.id
       WHERE sl.product_id = ? AND sl.quantity > 0 AND l.purpose = 'DISPLAY'
       ORDER BY sl.quantity DESC`,
      [productId]
    );

    const locations = [];
    let remaining = qty;

    for (const s of stock) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, s.quantity);
      locations.push({ location_id: s.location_id, quantity: take });
      remaining -= take;
    }
    if (remaining > 0) locations.push({ location_id: null, quantity: remaining });
    return locations;
  },

  async insertPickingItems(connection, listId, items) {
    for (const item of items) {
      await connection.query(
        `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, status, picked_from_location_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [listId, item.productId, item.sku, item.qty, item.status, item.locationId]
      );
    }
  },
};

export async function syncOrdersToDB(connection, ordersMap, userId, originalFilename) {
  let updatedCount = 0;
  const errors = [];

  for (const order of ordersMap.values()) {
    try {
      await connection.beginTransaction();

      // Picking List Header
      const [existingList] = await connection.query(
        "SELECT id FROM picking_lists WHERE original_invoice_id = ?",
        [order.invoiceId]
      );

      let listId;
      if (existingList.length === 0) {
        const [res] = await connection.query(
          `INSERT INTO picking_lists (user_id, source, original_invoice_id, customer_name, original_filename)
           VALUES (?, ?, ?, ?, ?)`,
          [userId, order.source, order.invoiceId, order.customer, originalFilename]
        );
        listId = res.insertId;
      } else {
        listId = existingList[0].id;
      }

      // Cek Item yg sudah ada
      const [dbItems] = await connection.query(
        "SELECT original_sku FROM picking_list_items WHERE picking_list_id = ?",
        [listId]
      );
      const existingSkus = new Set(dbItems.map((i) => i.original_sku));

      for (const item of order.items) {
        // Cek Master Produk
        const [products] = await connection.query(
          "SELECT id, is_package FROM products WHERE sku = ?",
          [item.sku]
        );

        if (products.length === 0) {
          errors.push(`Order ${order.invoiceId}: SKU ${item.sku} not found in Master.`);
          continue;
        }

        const product = products[0];

        // Insert jika belum ada
        if (!existingSkus.has(item.sku)) {
          const dbStatus = item.status;

          if (dbStatus === "PENDING") {
            // Package Splitting
            if (product.is_package) {
              const components = await DBLayer.getPackageComponents(connection, product.id);
              if (components.length > 0) {
                for (const comp of components) {
                  const compQty = item.qty * comp.quantity_per_package;
                  const locs = await DBLayer.findPickingLocations(
                    connection,
                    comp.component_product_id,
                    compQty
                  );
                  await DBLayer.insertPickingItems(
                    connection,
                    listId,
                    locs.map((l) => ({
                      productId: comp.component_product_id,
                      sku: item.sku,
                      qty: l.quantity,
                      status: dbStatus,
                      locationId: l.location_id,
                    }))
                  );
                }
              } else {
                const locs = await DBLayer.findPickingLocations(connection, product.id, item.qty);
                await DBLayer.insertPickingItems(
                  connection,
                  listId,
                  locs.map((l) => ({
                    productId: product.id,
                    sku: item.sku,
                    qty: l.quantity,
                    status: dbStatus,
                    locationId: l.location_id,
                  }))
                );
              }
            } else {
              // Single Product
              const locs = await DBLayer.findPickingLocations(connection, product.id, item.qty);
              await DBLayer.insertPickingItems(
                connection,
                listId,
                locs.map((l) => ({
                  productId: product.id,
                  sku: item.sku,
                  qty: l.quantity,
                  status: dbStatus,
                  locationId: l.location_id,
                }))
              );
            }
          } else {
            // Arsip/Non-Active Status (Langsung insert tanpa lokasi)
            await connection.query(
              `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, status, picked_from_location_id)
               VALUES (?, ?, ?, ?, ?, NULL)`,
              [listId, product.id, item.sku, item.qty, dbStatus]
            );
          }
        }
      }

      await connection.commit();
      updatedCount++;
    } catch (e) {
      await connection.rollback();
      console.error(`Error syncing order ${order.invoiceId}:`, e);
      errors.push(`Order ${order.invoiceId}: ${e.message}`);
    }
  }
  return { updatedCount, errors };
}
