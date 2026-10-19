import { describe, it, expect } from 'vitest';
import { useProductStock } from '@/composables/useProductStock.js';

describe('useProductStock composable', () => {
  const { getVirtualStock, resolveEffectiveStock, getDisplayWeight } = useProductStock();

  describe('getVirtualStock', () => {
    it('returns 0 for null, undefined, or non-package products', () => {
      expect(getVirtualStock(null)).toBe(0);
      expect(getVirtualStock(undefined)).toBe(0);
      expect(getVirtualStock({ is_package: false })).toBe(0);
      expect(getVirtualStock({ is_package: 0 })).toBe(0);
    });

    it('returns 0 if product is a package but components array is empty or missing', () => {
      expect(getVirtualStock({ is_package: true })).toBe(0);
      expect(getVirtualStock({ is_package: true, components: [] })).toBe(0);
      expect(getVirtualStock({ is_package: true, components: null })).toBe(0);
    });

    it('calculates the limiting component stock correctly', () => {
      const packageProduct = {
        is_package: true,
        components: [
          { stock_available: 10, quantity: 2 }, // can make 5
          { stock_available: 20, quantity: 1 }, // can make 20
          { stock_available: 9, quantity: 3 },  // can make 3 (bottleneck)
        ],
      };
      expect(getVirtualStock(packageProduct)).toBe(3);
    });

    it('returns 0 when any required component has 0 available stock', () => {
      const packageProduct = {
        is_package: true,
        components: [
          { stock_available: 10, quantity: 1 },
          { stock_available: 0, quantity: 2 },
        ],
      };
      expect(getVirtualStock(packageProduct)).toBe(0);
    });

    it('falls back to default values if component fields are missing', () => {
      const packageProduct = {
        is_package: true,
        components: [
          { stock_available: null, quantity: null }, // stockAvail = 0, needed = 1 => 0
        ],
      };
      expect(getVirtualStock(packageProduct)).toBe(0);
    });
  });

  describe('resolveEffectiveStock', () => {
    it('returns 0 for null or undefined product', () => {
      expect(resolveEffectiveStock(null)).toBe(0);
      expect(resolveEffectiveStock(undefined)).toBe(0);
    });

    it('resolves physical stock for regular products according to activeView', () => {
      const product = {
        is_package: false,
        totalStock: 50,
        stockGudang: 30,
        stockPajangan: 15,
        stockLTC: 5,
      };

      expect(resolveEffectiveStock(product, 'all')).toBe(50);
      expect(resolveEffectiveStock(product, 'gudang')).toBe(30);
      expect(resolveEffectiveStock(product, 'pajangan')).toBe(15);
      expect(resolveEffectiveStock(product, 'ltc')).toBe(5);
    });

    it('supports alternative snake_case field names (total_stock and stock)', () => {
      expect(resolveEffectiveStock({ is_package: false, total_stock: 42 }, 'all')).toBe(42);
      expect(resolveEffectiveStock({ is_package: false, stock: 17 }, 'all')).toBe(17);
    });

    it('uses physical stock for package product if physical stock > 0', () => {
      const packageProduct = {
        is_package: true,
        totalStock: 5,
        components: [{ stock_available: 100, quantity: 1 }],
      };
      expect(resolveEffectiveStock(packageProduct, 'all')).toBe(5);
    });

    it('falls back to virtual stock for package product if physical stock is 0 or null', () => {
      const packageProductZeroPhysical = {
        is_package: true,
        totalStock: 0,
        components: [{ stock_available: 20, quantity: 2 }],
      };
      expect(resolveEffectiveStock(packageProductZeroPhysical, 'all')).toBe(10);

      const packageProductNullPhysical = {
        is_package: true,
        totalStock: null,
        components: [{ stock_available: 15, quantity: 3 }],
      };
      expect(resolveEffectiveStock(packageProductNullPhysical, 'all')).toBe(5);
    });
  });

  describe('getDisplayWeight', () => {
    it('returns 0 for null or empty product', () => {
      expect(getDisplayWeight(null)).toBe(0);
      expect(getDisplayWeight({})).toBe(0);
    });

    it('returns direct product weight when present and greater than 0', () => {
      expect(getDisplayWeight({ weight: 250 })).toBe(250);
      expect(getDisplayWeight({ weight: '350.5' })).toBe(350.5);
    });

    it('calculates sum of component weights for package product when direct weight is missing', () => {
      const packageProduct = {
        is_package: true,
        components: [
          { weight: 100, quantity: 2 }, // 200
          { weight: 50, quantity: 3 },  // 150
        ],
      };
      expect(getDisplayWeight(packageProduct)).toBe(350);
    });

    it('returns 0 for package if any component is unweighed (weight <= 0 or missing)', () => {
      const packageWithUnweighedComp = {
        is_package: true,
        components: [
          { weight: 100, quantity: 2 },
          { weight: 0, quantity: 1 },
        ],
      };
      expect(getDisplayWeight(packageWithUnweighedComp)).toBe(0);

      const packageWithMissingWeight = {
        is_package: true,
        components: [
          { weight: 100, quantity: 2 },
          { weight: null, quantity: 1 },
        ],
      };
      expect(getDisplayWeight(packageWithMissingWeight)).toBe(0);
    });
  });
});
