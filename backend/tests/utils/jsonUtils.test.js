// backend/tests/utils/jsonUtils.test.js
import { describe, test, expect } from "@jest/globals";
import { parseJsonSafe } from "../../utils/jsonUtils.js";

describe("parseJsonSafe Utility", () => {
  test("harus mengembalikan object jika input adalah string JSON valid", () => {
    const raw = '{"userId":123,"role":"ADMIN"}';
    const result = parseJsonSafe(raw);
    expect(result).toEqual({ userId: 123, role: "ADMIN" });
  });

  test("harus mengembalikan array jika input adalah string JSON array valid", () => {
    const raw = '[1, 2, "three"]';
    const result = parseJsonSafe(raw, []);
    expect(result).toEqual([1, 2, "three"]);
  });

  test("harus mengembalikan objek langsung jika input sudah berupa Object (kompatibilitas MariaDB 10.11 native)", () => {
    const raw = { filters: { status: "ACTIVE" } };
    const result = parseJsonSafe(raw);
    expect(result).toBe(raw);
    expect(result).toEqual({ filters: { status: "ACTIVE" } });
  });

  test("harus mengembalikan fallback jika input berupa string rusak / malformed JSON", () => {
    const raw = '{"brokenJson": true,';
    const fallback = { error: true };
    const result = parseJsonSafe(raw, fallback);
    expect(result).toEqual(fallback);
  });

  test("harus mengembalikan fallback jika input null, undefined, atau string kosong", () => {
    expect(parseJsonSafe(null)).toEqual({});
    expect(parseJsonSafe(undefined, [])).toEqual([]);
    expect(parseJsonSafe("", null)).toBeNull();
  });

  test("harus mengembalikan fallback jika input bertipe non-JSON (boolean, number)", () => {
    expect(parseJsonSafe(12345, {})).toEqual({});
    expect(parseJsonSafe(true, null)).toBeNull();
  });
});
