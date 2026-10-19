import * as categoryService from "../services/categoryService.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";

/**
 * Mengambil semua kategori yang aktif
 */
export const getCategories = catchAsync(async (req, res) => {
  const data = await categoryService.getAllCategories();
  res.status(200).json({
    success: true,
    message: "Data kategori berhasil diambil",
    data,
  });
});

/**
 * Membuat kategori baru
 */
export const createCategory = catchAsync(async (req, res) => {
  const { name } = req.body;
  try {
    const data = await categoryService.createCategory(name);
    res.status(201).json({
      success: true,
      message: "Kategori berhasil dibuat",
      data,
    });
  } catch (error) {
    if (error.code === "DUPLICATE_ENTRY") {
      throw new AppError("Nama kategori sudah ada", 409, "DUPLICATE_ENTRY");
    }
    throw error;
  }
});

/**
 * Mengupdate kategori
 */
export const updateCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    await categoryService.updateCategory(id, name);
    res.status(200).json({
      success: true,
      message: "Kategori berhasil diupdate",
    });
  } catch (error) {
    if (error.code === "NOT_FOUND") {
      throw new AppError("Kategori tidak ditemukan", 404, "NOT_FOUND");
    }
    throw error;
  }
});

/**
 * Menghapus kategori (Soft Delete)
 */
export const deleteCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  try {
    await categoryService.deleteCategory(id);
    res.status(200).json({
      success: true,
      message: "Kategori berhasil dihapus",
    });
  } catch (error) {
    if (error.code === "NOT_FOUND") {
      throw new AppError("Kategori tidak ditemukan", 404, "NOT_FOUND");
    }
    throw error;
  }
});
