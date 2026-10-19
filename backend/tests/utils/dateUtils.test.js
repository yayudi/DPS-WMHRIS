// backend/tests/utils/dateUtils.test.js
import { describe, test, expect } from "@jest/globals";
import { timeToMinutes, minutesToTime } from "../../utils/dateUtils.js";

describe("dateUtils Utility", () => {
  describe("timeToMinutes", () => {
    test("harus mengonversi format 'HH:mm' ke total menit dengan benar", () => {
      expect(timeToMinutes("08:00")).toBe(480);
      expect(timeToMinutes("08:30")).toBe(510);
      expect(timeToMinutes("16:45")).toBe(1005);
      expect(timeToMinutes("00:00")).toBe(0);
      expect(timeToMinutes("23:59")).toBe(1439);
    });

    test("harus mengonversi format 'HH:mm:ss' ke total menit (mengabaikan detik)", () => {
      expect(timeToMinutes("08:00:00")).toBe(480);
      expect(timeToMinutes("08:15:42")).toBe(495);
      expect(timeToMinutes("17:00:59")).toBe(1020);
    });

    test("harus mengembalikan 0 jika input null, undefined, kosong, atau bukan string", () => {
      expect(timeToMinutes(null)).toBe(0);
      expect(timeToMinutes(undefined)).toBe(0);
      expect(timeToMinutes("")).toBe(0);
      expect(timeToMinutes(12345)).toBe(0);
      expect(timeToMinutes({})).toBe(0);
    });

    test("harus mengembalikan 0 jika string tidak valid atau tidak memiliki format jam:menit", () => {
      expect(timeToMinutes("invalid-time")).toBe(0);
      expect(timeToMinutes("abc:def")).toBe(0);
      expect(timeToMinutes("12")).toBe(0);
    });
  });

  describe("minutesToTime", () => {
    test("harus mengonversi menit ke format 'HH:mm:ss' secara default", () => {
      expect(minutesToTime(480)).toBe("08:00:00");
      expect(minutesToTime(510)).toBe("08:30:00");
      expect(minutesToTime(0)).toBe("00:00:00");
      expect(minutesToTime(1025)).toBe("17:05:00");
    });

    test("harus mengonversi menit ke format 'HH:mm' jika includeSeconds false", () => {
      expect(minutesToTime(480, false)).toBe("08:00");
      expect(minutesToTime(510, false)).toBe("08:30");
      expect(minutesToTime(1025, false)).toBe("17:05");
    });

    test("harus menangani pembulatan ke bawah jika menit memiliki angka desimal", () => {
      expect(minutesToTime(510.8)).toBe("08:30:00");
      expect(minutesToTime(510.2, false)).toBe("08:30");
    });

    test("harus mengembalikan null jika input null, undefined, NaN, atau angka negatif", () => {
      expect(minutesToTime(null)).toBeNull();
      expect(minutesToTime(undefined)).toBeNull();
      expect(minutesToTime(NaN)).toBeNull();
      expect(minutesToTime(-10)).toBeNull();
    });
  });
});
