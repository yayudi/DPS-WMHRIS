import { describe, it, expect, jest } from "@jest/globals";
import { styleHeader, sanitizeSheetName } from "../../utils/excelUtils.js";

describe("excelUtils", () => {
  describe("styleHeader", () => {
    it("harus menata gaya baris header dengan parameter default", () => {
      const mockCells = {};
      const mockRow = {
        height: 0,
        getCell: jest.fn((colIdx) => {
          if (!mockCells[colIdx]) mockCells[colIdx] = {};
          return mockCells[colIdx];
        }),
        commit: jest.fn(),
      };
      const mockWorksheet = {
        getRow: jest.fn(() => mockRow),
      };

      styleHeader(mockWorksheet, 1, 3);

      expect(mockWorksheet.getRow).toHaveBeenCalledWith(1);
      expect(mockRow.height).toBe(20);
      expect(mockRow.commit).toHaveBeenCalledTimes(1);

      // Verify cells 1 to 3
      for (let i = 1; i <= 3; i++) {
        expect(mockCells[i].fill).toEqual({
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD9E1F2" },
        });
        expect(mockCells[i].font).toEqual({
          bold: true,
          color: { argb: "FF000000" },
        });
        expect(mockCells[i].border).toEqual({
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        });
        expect(mockCells[i].alignment).toEqual({
          vertical: "middle",
          horizontal: "center",
        });
      }
    });

    it("harus menggunakan warna kustom jika diberikan", () => {
      const mockCells = {};
      const mockRow = {
        height: 0,
        getCell: jest.fn((colIdx) => {
          if (!mockCells[colIdx]) mockCells[colIdx] = {};
          return mockCells[colIdx];
        }),
        commit: jest.fn(),
      };
      const mockWorksheet = {
        getRow: jest.fn(() => mockRow),
      };

      styleHeader(mockWorksheet, 2, 2, "FF4472C4", "FFFFFFFF");

      expect(mockWorksheet.getRow).toHaveBeenCalledWith(2);
      expect(mockCells[1].fill.fgColor.argb).toBe("FF4472C4");
      expect(mockCells[1].font.color.argb).toBe("FFFFFFFF");
    });

    it("harus aman jika worksheet null atau colCount <= 0", () => {
      expect(() => styleHeader(null, 1, 5)).not.toThrow();
      expect(() => styleHeader({}, 1, 0)).not.toThrow();
      expect(() => styleHeader({}, 1, -1)).not.toThrow();
    });
  });

  describe("sanitizeSheetName", () => {
    it("harus memotong nama sheet yang lebih dari 31 karakter", () => {
      const longName = "A".repeat(45);
      const result = sanitizeSheetName(longName);
      expect(result.length).toBe(31);
      expect(result).toBe("A".repeat(31));
    });

    it("harus mengganti karakter terlarang Excel dengan hyphen", () => {
      const unsafe = "Sales [2026] / Jan * Q1? \\ test";
      const safe = sanitizeSheetName(unsafe);
      expect(safe).not.toMatch(/[\\/?*[\]]/);
      expect(safe).toBe("Sales -2026- - Jan - Q1- - test");
    });

    it("harus mengembalikan fallback jika input kosong atau null", () => {
      expect(sanitizeSheetName("")).toBe("Sheet1");
      expect(sanitizeSheetName(null)).toBe("Sheet1");
      expect(sanitizeSheetName(undefined)).toBe("Sheet1");
    });
  });
});
