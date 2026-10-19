import catchAsync from "../utils/catchAsync.js";
// backend/controllers/statisticController.js
import * as statisticService from "../services/statisticService.js";
import db from "../config/db.js";
import * as jobRepo from "../repositories/jobRepository.js";
import { EXPORT_JOB_TYPE } from "../config/jobConstants.js";
export const getStockMovements = catchAsync(async (req, res, next) => {
  const {
    startDate,
    endDate,
    searchQuery,
    status,
    movement,
    building,
    timeResolution,
    categoryId,
  } = req.query;

  let buildingsArray = [];
  if (building) {
    if (typeof building === "object" && !Array.isArray(building)) {
      buildingsArray = building;
    } else {
      buildingsArray = Array.isArray(building) ? building : building.split(",");
    }
  }

  const filters = {
    startDate,
    endDate,
    searchQuery,
    status,
    movement,
    buildings: buildingsArray,
    timeResolution,
    categoryId,
  };

  const data = await statisticService.getStockMovementStatistics(filters);
  res.json({
    success: true,
    data,
  });
});

export const requestStockMovementsExport = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { startDate, endDate, searchQuery, status, movement, building, categoryId } = req.body;

  const filters = {
    startDate,
    endDate,
    searchQuery,
    status,
    movement,
    buildings: building, // array if passed from UI usually
    categoryId,
    exportType: EXPORT_JOB_TYPE.STATISTICS_STOCK_MOVEMENT,
  };

  const jobId = await jobRepo.createExportJob(db, {
    userId,
    filters,
    jobType: EXPORT_JOB_TYPE.STATISTICS_STOCK_MOVEMENT,
  });

  res.status(202).json({
    success: true,
    message: "Permintaan ekspor statistik stok diterima. File sedang diproses.",
    jobId,
  });
});

export const getStockTimeline = catchAsync(async (req, res, next) => {
  const { searchQuery, building, status, movement } = req.query;

  let buildingsArray = [];
  if (building) {
    if (typeof building === "object" && !Array.isArray(building)) {
      buildingsArray = building;
    } else {
      buildingsArray = Array.isArray(building) ? building : building.split(",");
    }
  }

  const filters = {
    searchQuery,
    status,
    movement,
    buildings: buildingsArray,
  };

  const data = await statisticService.getStockTimelineStatistics(filters);
  res.json({
    success: true,
    data,
  });
});

export const requestStockTimelineExport = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { searchQuery, building, status, movement } = req.body;

  const filters = {
    searchQuery,
    status: status || "all",
    movement: movement || "all",
    buildings: building || [],
    exportType: EXPORT_JOB_TYPE.STATISTICS_STOCK_TIMELINE,
  };

  const jobId = await jobRepo.createExportJob(db, {
    userId,
    filters,
    jobType: EXPORT_JOB_TYPE.STATISTICS_STOCK_TIMELINE,
  });

  res.status(202).json({
    success: true,
    message: "Permintaan ekspor statistik timeline stok diterima. File sedang diproses.",
    jobId,
  });
});

export const getInventoryValue = catchAsync(async (req, res, next) => {
  const { searchQuery, building, purpose, isPackage, stockStatus, categoryId } = req.query;

  let buildingsArray = [];
  if (building) {
    if (typeof building === "object" && !Array.isArray(building)) {
      buildingsArray = building;
    } else {
      buildingsArray = Array.isArray(building) ? building : building.split(",");
    }
  }

  const filters = {
    searchQuery,
    building: buildingsArray,
    purpose,
    isPackage,
    stockStatus,
    categoryId,
  };

  const data = await statisticService.getInventoryValueStatistics(filters);
  res.json({
    success: true,
    data,
  });
});

export const getShopPerformance = catchAsync(async (req, res, next) => {
  const { startDate, endDate, source, shopName, prevStartDate, prevEndDate } = req.query;

  const filters = { startDate, endDate, source, shopName, prevStartDate, prevEndDate };
  const data = await statisticService.getShopPerformanceStats(filters);

  res.json({
    success: true,
    data,
  });
});

export const getPackageAnalysis = catchAsync(async (req, res, next) => {
  const { startDate, endDate, categoryId, searchQuery } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "startDate dan endDate wajib diisi",
    });
  }

  const filters = { startDate, endDate, categoryId, searchQuery };
  const data = await statisticService.getPackageComponentAnalysis(filters);

  res.json({
    success: true,
    data,
  });
});

export const getLocationAnalysis = catchAsync(async (req, res, next) => {
  const { building, floor, purpose } = req.query;

  const filters = {
    buildings: building,
    floors: floor,
    purposes: purpose,
  };

  const data = await statisticService.getLocationAnalysis(filters);

  res.json({
    success: true,
    data,
  });
});
