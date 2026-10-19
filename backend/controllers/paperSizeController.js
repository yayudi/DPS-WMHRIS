// backend/controllers/paperSizeController.js
import * as paperSizeService from '../services/paperSizeService.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

export const getAllPaperSizes = catchAsync(async (req, res) => {
  const data = await paperSizeService.getAllPaperSizes();
  res.status(200).json({
    success: true,
    message: 'Berhasil mengambil data paper size',
    data,
  });
});

export const getPaperSizeById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = await paperSizeService.getPaperSizeById(id);
  res.status(200).json({
    success: true,
    message: 'Berhasil mengambil detail paper size',
    data,
  });
});

export const createPaperSize = catchAsync(async (req, res) => {
  const {
    name,
    topMargin,
    sideMargin,
    verticalPitch,
    horizontalPitch,
    labelWidth,
    labelHeight,
    numberAcross,
    numberDown,
    pageWidth,
    pageHeight,
  } = req.body;

  if (
    !name ||
    labelWidth === undefined ||
    labelHeight === undefined ||
    pageWidth === undefined ||
    pageHeight === undefined
  ) {
    throw new AppError(
      'Name, labelWidth, labelHeight, pageWidth, dan pageHeight wajib diisi',
      400,
      'VALIDATION_ERROR',
    );
  }

  const data = await paperSizeService.createPaperSize({
    name,
    topMargin,
    sideMargin,
    verticalPitch,
    horizontalPitch,
    labelWidth,
    labelHeight,
    numberAcross,
    numberDown,
    pageWidth,
    pageHeight,
  });

  res.status(201).json({
    success: true,
    message: 'Berhasil membuat paper size',
    data,
  });
});

export const updatePaperSize = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    topMargin,
    sideMargin,
    verticalPitch,
    horizontalPitch,
    labelWidth,
    labelHeight,
    numberAcross,
    numberDown,
    pageWidth,
    pageHeight,
  } = req.body;

  if (
    !name ||
    labelWidth === undefined ||
    labelHeight === undefined ||
    pageWidth === undefined ||
    pageHeight === undefined
  ) {
    throw new AppError(
      'Name, labelWidth, labelHeight, pageWidth, dan pageHeight wajib diisi',
      400,
      'VALIDATION_ERROR',
    );
  }

  const data = await paperSizeService.updatePaperSize(id, {
    name,
    topMargin,
    sideMargin,
    verticalPitch,
    horizontalPitch,
    labelWidth,
    labelHeight,
    numberAcross,
    numberDown,
    pageWidth,
    pageHeight,
  });

  res.status(200).json({
    success: true,
    message: 'Berhasil memperbarui paper size',
    data,
  });
});

export const deletePaperSize = catchAsync(async (req, res) => {
  const { id } = req.params;
  await paperSizeService.deletePaperSize(id);
  res.status(200).json({
    success: true,
    message: 'Berhasil menghapus paper size',
  });
});
