import catchAsync from "../utils/catchAsync.js";
import * as locationService from "../services/locationService.js";

/**
 * Handle request to create a new location
 * @param {object} req
 * @param {object} res
 */
export const createLocation = catchAsync(async (req, res) => {
  const { code, building, floor, name, purpose } = req.body;
  const userContext = {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };

  const locationId = await locationService.addLocation(
    { code, building, floor, name, purpose },
    userContext,
  );

  return res.status(201).json({
    success: true,
    message: "Location created successfully.",
    data: { locationId },
  });
});

export const getAllLocations = catchAsync(async (req, res) => {
  const locations = await locationService.getAllLocations();
  res.json({ success: true, data: locations });
});

export const getStockSample = catchAsync(async (req, res) => {
  const { id } = req.params;
  const sample = await locationService.getStockSample(id);
  res.json({ success: true, data: sample });
});

export const updateLocation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userContext = {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };

  await locationService.updateLocation(id, req.body, userContext);
  res.json({ success: true, message: "Lokasi berhasil diperbarui." });
});

export const deleteLocation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userContext = {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };

  await locationService.deleteLocation(id, userContext);
  res.json({ success: true, message: "Lokasi berhasil dihapus." });
});
