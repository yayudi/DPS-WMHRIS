// backend/router/systemLogRouter.js
import { Router } from "express";
import * as logController from "../controllers/systemLogController.js";

const router = Router();

router.get("/", logController.getSystemLogs);

export default router;
