import AppError from "../utils/AppError.js";

/**
 * Middleware untuk memvalidasi input request menggunakan Zod schema.
 * @param {import("zod").AnyZodObject} schema - Skema Zod
 * @param {string} source - Sumber data (body, query, params)
 */
export const validate = (schema, source = "body") => {
  return async (req, res, next) => {
    try {
      // Validasi data
      const parsedData = await schema.parseAsync(req[source]);
      
      // Timpa data original dengan data yang sudah di-parse dan di-cast oleh Zod
      // Di Express 5, req.query bersifat getter-only di prototype; defineProperty aman untuk Express 4 & 5
      if (source === "query") {
        Object.defineProperty(req, "query", {
          value: parsedData,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        req[source] = parsedData;
      }
      
      next();
    } catch (error) {
      // Menangkap error dari Zod
      if (error && error.name === "ZodError") {
        // Gabungkan semua pesan error Zod
        const errList = error.errors || error.issues || [];
        const messages = errList
          .map((err) => {
            const prefix = err.path?.length ? `${err.path.join(".")}: ` : "";
            return `${prefix}${err.message}`;
          })
          .join(", ");
        return next(new AppError(messages, 400, "VALIDATION_ERROR"));
      }
      next(error);
    }
  };
};
