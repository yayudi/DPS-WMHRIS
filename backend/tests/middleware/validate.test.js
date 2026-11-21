import { jest } from "@jest/globals";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import AppError from "../../utils/AppError.js";

describe("validate middleware (R-01 Express 4 & 5 query safety)", () => {
  it("memvalidasi req.body, menimpa hasil parse, dan memanggil next tanpa error", async () => {
    const schema = z.object({ qty: z.coerce.number().int() });
    const req = { body: { qty: "12" } };
    const next = jest.fn();

    await validate(schema)(req, {}, next);

    expect(req.body).toEqual({ qty: 12 });
    expect(next).toHaveBeenCalledWith();
  });

  it("memperbarui req.query aman pada objek getter-only (simulasi Express 5 prototype getter)", async () => {
    const schema = z.object({ page: z.coerce.number().int().default(1) });
    const proto = {};
    Object.defineProperty(proto, "query", {
      get() {
        return { page: "3" };
      },
      enumerable: true,
      configurable: true,
    });
    const req = Object.create(proto);
    const next = jest.fn();

    await validate(schema, "query")(req, {}, next);

    expect(req.query).toEqual({ page: 3 });
    expect(next).toHaveBeenCalledWith();

    // Memastikan jika middleware validate("query") dijalankan dua kali tetap aman
    await validate(schema, "query")(req, {}, next);
    expect(req.query).toEqual({ page: 3 });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("memperbarui req.query aman pada objek Express 4 standar", async () => {
    const schema = z.object({ status: z.string().trim() });
    const req = { query: { status: " PENDING " } };
    const next = jest.fn();

    await validate(schema, "query")(req, {}, next);

    expect(req.query).toEqual({ status: "PENDING" });
    expect(next).toHaveBeenCalledWith();
  });

  it("memformat error root tanpa awalan ': ' dan error field dengan 'path: message'", async () => {
    const rootSchema = z.object({ a: z.string() });
    const nextRoot = jest.fn();
    await validate(rootSchema)({ body: undefined }, {}, nextRoot);

    const rootErr = nextRoot.mock.calls[0][0];
    expect(rootErr).toBeInstanceOf(AppError);
    expect(rootErr.statusCode).toBe(400);
    expect(rootErr.errorCode).toBe("VALIDATION_ERROR");
    expect(rootErr.message.startsWith(":")).toBe(false);

    const fieldSchema = z.object({ sku: z.string().min(1, "SKU wajib diisi") });
    const nextField = jest.fn();
    await validate(fieldSchema)({ body: { sku: "" } }, {}, nextField);

    const fieldErr = nextField.mock.calls[0][0];
    expect(fieldErr).toBeInstanceOf(AppError);
    expect(fieldErr.message).toBe("sku: SKU wajib diisi");
  });

  it("meneruskan error non-Zod apa adanya ke next(err)", async () => {
    const brokenSchema = {
      parseAsync: jest.fn().mockRejectedValue(new Error("Unexpected failure")),
    };
    const next = jest.fn();

    await validate(brokenSchema)({ body: {} }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0].message).toBe("Unexpected failure");
  });
});
