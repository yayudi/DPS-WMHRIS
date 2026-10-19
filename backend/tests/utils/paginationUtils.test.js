import {
  getPaginationOffset,
  normalizePagination,
  formatPaginationMeta,
} from "../../utils/paginationUtils.js";

describe("paginationUtils", () => {
  describe("getPaginationOffset", () => {
    test("harus mengembalikan offset 0 untuk halaman pertama dengan limit default", () => {
      expect(getPaginationOffset()).toBe(0);
      expect(getPaginationOffset(1, 10)).toBe(0);
    });

    test("harus menghitung offset dengan benar untuk halaman lanjutan", () => {
      expect(getPaginationOffset(2, 10)).toBe(10);
      expect(getPaginationOffset(3, 25)).toBe(50);
      expect(getPaginationOffset(5, 20)).toBe(80);
    });

    test("harus menangani string numerik", () => {
      expect(getPaginationOffset("4", "15")).toBe(45);
    });

    test("harus mengamankan nilai halaman negatif atau non-numerik ke halaman 1", () => {
      expect(getPaginationOffset(-5, 10)).toBe(0);
      expect(getPaginationOffset(0, 10)).toBe(0);
      expect(getPaginationOffset("abc", 10)).toBe(0);
      expect(getPaginationOffset(null, 10)).toBe(0);
    });

    test("harus mengamankan nilai limit negatif atau non-numerik ke default 10", () => {
      expect(getPaginationOffset(2, -10)).toBe(10);
      expect(getPaginationOffset(3, "invalid")).toBe(20);
    });
  });

  describe("normalizePagination", () => {
    test("harus menggunakan nilai default jika dipanggil tanpa argumen atau objek kosong", () => {
      expect(normalizePagination()).toEqual({ page: 1, limit: 10, offset: 0 });
      expect(normalizePagination({})).toEqual({ page: 1, limit: 10, offset: 0 });
      expect(normalizePagination(null)).toEqual({ page: 1, limit: 10, offset: 0 });
    });

    test("harus menormalisasi query object bertipe string", () => {
      const result = normalizePagination({ page: "3", limit: "25" });
      expect(result).toEqual({ page: 3, limit: 25, offset: 50 });
    });

    test("harus membatasi limit jika melebihi maxLimit", () => {
      const result = normalizePagination({ page: 1, limit: 500 }, 10, 100);
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
    });

    test("harus mempertahankan limit jika defaultLimit lebih besar dari default maxLimit", () => {
      const result = normalizePagination({}, 200, 100);
      expect(result.limit).toBe(200);
    });

    test("harus menggunakan fallback defaultLimit jika limit tidak valid atau <= 0", () => {
      expect(normalizePagination({ page: 2, limit: 0 }, 15)).toEqual({
        page: 2,
        limit: 15,
        offset: 15,
      });
      expect(normalizePagination({ page: 2, limit: -5 }, 20)).toEqual({
        page: 2,
        limit: 20,
        offset: 20,
      });
      expect(normalizePagination({ page: 2, limit: "none" }, 30)).toEqual({
        page: 2,
        limit: 30,
        offset: 30,
      });
    });

    test("harus mengamankan page negatif ke 1", () => {
      const result = normalizePagination({ page: -10, limit: 10 });
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });

    test("harus mendukung pemanggilan dengan argumen page numerik langsung", () => {
      const result = normalizePagination(3, 50);
      expect(result).toEqual({ page: 3, limit: 50, offset: 100 });
    });
  });

  describe("formatPaginationMeta", () => {
    test("harus memformat metadata paginasi dengan benar", () => {
      const meta = formatPaginationMeta(95, 2, 10);
      expect(meta).toEqual({
        page: 2,
        limit: 10,
        total: 95,
        totalPages: 10,
      });
    });

    test("harus menghasilkan totalPages 0 jika total adalah 0", () => {
      const meta = formatPaginationMeta(0, 1, 10);
      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    test("harus menangani input string numerik", () => {
      const meta = formatPaginationMeta("100", "3", "20");
      expect(meta).toEqual({
        page: 3,
        limit: 20,
        total: 100,
        totalPages: 5,
      });
    });

    test("harus menangani pemanggilan tanpa parameter (default fallback)", () => {
      const meta = formatPaginationMeta();
      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    test("harus mengamankan nilai negatif atau non-numerik", () => {
      const meta = formatPaginationMeta(-50, -2, -10);
      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });

      const metaNonNumeric = formatPaginationMeta("invalid", "invalid", "invalid");
      expect(metaNonNumeric).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });
});
