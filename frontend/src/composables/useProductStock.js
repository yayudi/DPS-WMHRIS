// frontend/src/composables/useProductStock.js

/**
 * Composable for calculating product stock, virtual stock for package products,
 * and component-aggregated weights.
 *
 * @returns {{
 *   getVirtualStock: (product: object|null) => number,
 *   resolveEffectiveStock: (product: object|null, activeView?: string) => number,
 *   getDisplayWeight: (product: object|null) => number
 * }}
 */
export function useProductStock() {
  /**
   * Menghitung stok virtual untuk produk paket berdasarkan ketersediaan komponennya.
   * Mengambil nilai minimum dari (stok_komponen / kebutuhan_komponen).
   *
   * @param {object|null} product - Objek produk dengan properti is_package dan components
   * @returns {number} Jumlah paket virtual yang dapat dirakit (integer >= 0)
   */
  const getVirtualStock = (product) => {
    if (
      product?.is_package &&
      Array.isArray(product.components) &&
      product.components.length > 0
    ) {
      const possiblePackages = product.components.map((c) => {
        const stockAvail = c.stock_available ?? 0;
        const needed = c.quantity || 1;
        return Math.floor(stockAvail / needed);
      });
      return Math.min(...possiblePackages);
    }
    return 0;
  };

  /**
   * Menentukan stok efektif produk berdasarkan view lokasi aktif ('all', 'gudang', 'pajangan', 'ltc').
   * Jika produk merupakan paket dan stok fisiknya 0/kosong, nilai dialihkan ke stok virtual.
   *
   * @param {object|null} product - Objek produk
   * @param {string} [activeView='all'] - Filter tampilan lokasi aktif
   * @returns {number} Jumlah stok efektif
   */
  const resolveEffectiveStock = (product, activeView = 'all') => {
    if (!product) return 0;

    let physicalStock = 0;
    if (activeView === 'all') {
      physicalStock = product.totalStock ?? product.total_stock ?? product.stock ?? 0;
    } else if (activeView === 'gudang') {
      physicalStock = product.stockGudang ?? 0;
    } else if (activeView === 'pajangan') {
      physicalStock = product.stockPajangan ?? 0;
    } else if (activeView === 'ltc') {
      physicalStock = product.stockLTC ?? 0;
    } else {
      physicalStock = product.totalStock ?? product.total_stock ?? product.stock ?? 0;
    }

    if (product.is_package) {
      return physicalStock !== 0 && physicalStock !== null && physicalStock !== undefined
        ? physicalStock
        : getVirtualStock(product);
    }

    return physicalStock !== null && physicalStock !== undefined ? physicalStock : 0;
  };

  /**
   * Menghitung bobot tampilan produk.
   * Jika produk paket belum memiliki bobot langsung, hitung akumulasi bobot dari seluruh komponennya.
   * Jika salah satu komponen tidak memiliki bobot (> 0), kembalikan 0.
   *
   * @param {object|null} product - Objek produk
   * @returns {number} Berat produk dalam gram
   */
  const getDisplayWeight = (product) => {
    if (!product) return 0;
    if (product.weight && Number(product.weight) > 0) {
      return Number(product.weight);
    }
    if (
      product.is_package &&
      Array.isArray(product.components) &&
      product.components.length > 0
    ) {
      const hasUnweighedComponent = product.components.some(
        (c) => !c.weight || Number(c.weight) <= 0,
      );
      if (hasUnweighedComponent) return 0;

      return product.components.reduce(
        (sum, c) => sum + (Number(c.weight) || 0) * (c.quantity || 1),
        0,
      );
    }
    return 0;
  };

  return {
    getVirtualStock,
    resolveEffectiveStock,
    getDisplayWeight,
  };
}
