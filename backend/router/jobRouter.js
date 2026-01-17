// backend\router\jobRouter.js
import express from "express";
import * as jobController from "../controllers/jobController.js";

const router = express.Router();

// GET /api/jobs/import - Get history of import jobs
router.get("/import", jobController.getUserImportJobs);

export default router;
