// backend\repositories\productRepository.js

// Ambil ID berdasarkan SKU
export const getIdBySku = async (connection, sku) => {
  const [rows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
  return rows.length > 0 ? rows[0].id : null;
};

// Ambil info produk dasar (Bulk)
export const getProductsBySkus = async (connection, skuList) => {
  if (skuList.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, sku, is_package, name, price FROM products WHERE sku IN (?)`,
    [skuList]
  );
  return rows;
};

// Ambil komponen paket untuk daftar ID produk paket (Bulk)
export const getBulkPackageComponents = async (connection, packageProductIds) => {
  if (packageProductIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT
       pc.package_product_id,
       pc.component_product_id,
       pc.quantity_per_package,
       p.sku as component_sku
     FROM package_components pc
     JOIN products p ON pc.component_product_id = p.id
     WHERE pc.package_product_id IN (?)`,
    [packageProductIds]
  );
  return rows;
};

// Helper Komposit: Ambil Map Produk lengkap dengan komponennya
export const getProductMapWithComponents = async (connection, skuArray) => {
  const productMap = new Map();
  if (!skuArray || skuArray.length === 0) return productMap;

  // Ambil Produk Dasar
  const products = await getProductsBySkus(connection, skuArray);
  const packageIds = [];

  products.forEach((p) => {
    productMap.set(p.sku, {
      id: p.id,
      name: p.name,
      is_package: p.is_package === 1,
      components: [],
    });
    if (p.is_package === 1) packageIds.push(p.id);
  });

  // Ambil Komponen jika ada Paket
  if (packageIds.length > 0) {
    const components = await getBulkPackageComponents(connection, packageIds);

    components.forEach((c) => {
      // Cari SKU parent di map
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
