import * as locationService from "../services/locationService.js";
import db from "../config/db.js";
import { createLog } from "../repositories/systemLogRepository.js";

/**
 * Handle request to create a new location
 * @param {object} req
 * @param {object} res
 */
export const createLocation = async (req, res) => {
  try {
    const { code, building, floor, name, purpose } = req.body;

    // 1. Structural Validation (Fail Fast)
    if (!code || !building || !purpose) {
      return res.status(400).json({
        success: false,
        message: "Code, Building, and Purpose are required fields.",
        error_code: "VALIDATION_ERROR",
      });
    }

    // 2. Call Service
    const locationId = await locationService.addLocation({ code, building, floor, name, purpose });

    // 3. LOGGING
    await createLog(db, {
      userId: req.user.id,
      action: "CREATE",
      targetType: "LOCATION",
      targetId: String(locationId),
      changes: { code, building, floor, name, purpose },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // 3. Success Response
    return res.status(201).json({
      success: true,
      message: "Location created successfully.",
      data: { locationId },
    });
  } catch (error) {
    console.error("[LocationController] Error creating location:", error);

    // Map Service Errors to HTTP Codes
    if (error.message.includes("VALIDATION_ERROR")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace("VALIDATION_ERROR: ", ""),
        error_code: "VALIDATION_ERROR",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
