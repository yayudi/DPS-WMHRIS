// backend/tests/utils/sqlUtils.test.js
import { describe, test, expect } from "@jest/globals";
import { buildTriStateWhere } from "../../utils/sqlUtils.js";

describe("sqlUtils - buildTriStateWhere", () => {
  test("harus mengembalikan array kosong jika filter bernilai null, undefined, atau string kosong", () => {
    const params = [];
    expect(buildTriStateWhere("status", null, params)).toEqual([]);
    expect(buildTriStateWhere("status", undefined, params)).toEqual([]);
    expect(buildTriStateWhere("status", "", params)).toEqual([]);
    expect(params).toHaveLength(0);
  });

  test("harus mengabaikan filter bernilai 'all', 'All', atau 'ALL'", () => {
    const params = [];
    expect(buildTriStateWhere("category", "all", params)).toEqual([]);
    expect(buildTriStateWhere("category", "All", params)).toEqual([]);
    expect(buildTriStateWhere("category", "ALL", params)).toEqual([]);
    expect(params).toHaveLength(0);
  });

  test("harus menangani array langsung sebagai klausul IN (?)", () => {
    const params = [];
    const clauses = buildTriStateWhere("sm.movement_type", ["INBOUND", "TRANSFER"], params);
    expect(clauses).toEqual(["sm.movement_type IN (?)"]);
    expect(params).toEqual([["INBOUND", "TRANSFER"]]);
  });

  test("harus mengembalikan array kosong jika array filter kosong", () => {
    const params = [];
    const clauses = buildTriStateWhere("sm.movement_type", [], params);
    expect(clauses).toEqual([]);
    expect(params).toHaveLength(0);
  });

  test("harus menangani objek TriState { include, exclude } dengan benar", () => {
    const params = [];
    const filter = {
      include: ["GUDANG_A", "GUDANG_B"],
      exclude: ["GUDANG_TRANSIT"]
    };
    const clauses = buildTriStateWhere("l.building", filter, params);
    expect(clauses).toEqual(["l.building IN (?)", "l.building NOT IN (?)"]);
    expect(params).toEqual([
      ["GUDANG_A", "GUDANG_B"],
      ["GUDANG_TRANSIT"]
    ]);
  });

  test("harus menangani objek TriState dengan hanya include atau hanya exclude", () => {
    const params1 = [];
    const clauses1 = buildTriStateWhere("status", { include: ["ACTIVE"] }, params1);
    expect(clauses1).toEqual(["status IN (?)"]);
    expect(params1).toEqual([["ACTIVE"]]);

    const params2 = [];
    const clauses2 = buildTriStateWhere("status", { exclude: ["DELETED"] }, params2);
    expect(clauses2).toEqual(["status NOT IN (?)"]);
    expect(params2).toEqual([["DELETED"]]);
  });

  test("harus menangani objek TriState include/exclude yang dikirim sebagai dictionary bertipe Object.values", () => {
    const params = [];
    const filter = {
      include: { 0: "LOC_1", 1: "LOC_2" },
      exclude: { 0: "LOC_9" }
    };
    const clauses = buildTriStateWhere("location_id", filter, params);
    expect(clauses).toEqual(["location_id IN (?)", "location_id NOT IN (?)"]);
    expect(params).toEqual([["LOC_1", "LOC_2"], ["LOC_9"]]);
  });

  test("harus mem-parse stringified JSON TriState object atau array", () => {
    const params1 = [];
    const jsonStr1 = JSON.stringify({ include: ["CAT_1"], exclude: ["CAT_9"] });
    const clauses1 = buildTriStateWhere("category_id", jsonStr1, params1);
    expect(clauses1).toEqual(["category_id IN (?)", "category_id NOT IN (?)"]);
    expect(params1).toEqual([["CAT_1"], ["CAT_9"]]);

    const params2 = [];
    const jsonStr2 = JSON.stringify(["ITEM_A", "ITEM_B"]);
    const clauses2 = buildTriStateWhere("sku", jsonStr2, params2);
    expect(clauses2).toEqual(["sku IN (?)"]);
    expect(params2).toEqual([["ITEM_A", "ITEM_B"]]);
  });

  test("harus menangani string biasa sebagai equality match (= ?)", () => {
    const params = [];
    const clauses = buildTriStateWhere("action", "LOGIN_SUCCESS", params);
    expect(clauses).toEqual(["action = ?"]);
    expect(params).toEqual(["LOGIN_SUCCESS"]);
  });

  test("harus menangani number sebagai equality match (= ?)", () => {
    const params = [];
    const clauses = buildTriStateWhere("user_id", 42, params);
    expect(clauses).toEqual(["user_id = ?"]);
    expect(params).toEqual([42]);
  });
});
