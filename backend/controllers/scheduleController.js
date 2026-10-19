import catchAsync from "../utils/catchAsync.js";
import * as scheduleService from '../services/scheduleService.js';
import * as jobRepositories from '../repositories/jobRepository.js';
import db from '../config/db.js';
import ExcelJS from 'exceljs';
import { IMPORT_JOB_TYPE } from '../config/jobConstants.js';

import AppError from "../utils/AppError.js";
export const getSchedules = catchAsync(async (req, res, next) => {
  const { userId, startDate, endDate } = req.query;

  const schedules = await scheduleService.getSchedules(userId, startDate, endDate);
  res.json({ success: true, data: schedules });
});

export const createSchedule = catchAsync(async (req, res, next) => {
  const { userId, shiftId, date } = req.body;
  // createdBy could be from req.user
  const createdBy = req.user ? req.user.id : null;

  await scheduleService.createSchedule(userId, shiftId, date, createdBy);
  res.json({ success: true, message: 'Schedule saved' });
});

export const deleteSchedule = catchAsync(async (req, res, next) => {
  const { userId, date } = req.query; // Or req.body / req.params

  await scheduleService.deleteSchedule(userId, date);
  res.json({ success: true, message: 'Schedule deleted' });
});

/**
 * POST /api/schedules/import
 */
export const uploadImportSchedule = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("File Excel wajib diupload.", 400));
  }

  const jobId = await jobRepositories.createImportJob(
    req.connection,
    {
      userId: req.user.id,
      jobType: IMPORT_JOB_TYPE.SCHEDULES,
      filePath: req.file.path,
      filename: req.file.originalname
    }
  );

  res.json({
    success: true,
    message: "Import Jadwal sedang diproses di background.",
    data: { jobId }
  });
});

/**
 * GET /api/schedules/template
 */
/**
 * GET /api/schedules/template
 */
export const downloadTemplate = catchAsync(async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import Schedule");

    // Validasi Data (Dropdown)
    // Ambil User & Shift dari DB
    const [users] = await db.query("SELECT username FROM users WHERE is_active = 1 ORDER BY username");
    const [shifts] = await db.query("SELECT name FROM shifts ORDER BY name");

    // -- HIDDEN SHEET FOR DROPDOWN DATA --
    // Excel/LibreOffice often requires list data to be on a separate sheet for validation if the list is long
    // But simplistic CSV-style lists in validation formula work for small lists.
    // For Safety with many users, let's use a Hidden Sheet.
    const dataSheet = workbook.addWorksheet("DataList");
    dataSheet.state = "hidden";

    // Write Users to Column A
    users.forEach((u, i) => {
      dataSheet.getCell(`A${i + 1}`).value = u.username;
    });
    // Write Shifts to Column B
    shifts.forEach((s, i) => {
      dataSheet.getCell(`B${i + 1}`).value = s.name;
    });

    const userRef = `DataList!$A$1:$A$${users.length}`;
    const shiftRef = `DataList!$B$1:$B$${shifts.length}`;

    // -- MAIN SHEET HEADERS --
    sheet.columns = [
      { header: "Username", key: "username", width: 25 },
      { header: "Date (YYYY-MM-DD)", key: "date", width: 20 },
      { header: "Shift Name", key: "shift", width: 25 },
    ];

    // Style Header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFCCCCCC" },
    };

    // -- EXAMPLE ROW (Instruction) --
    const exampleRow = sheet.addRow(["user_demo", "2026-01-31", "Regular Pagi"]);
    exampleRow.font = { italic: true, color: { argb: "FF888888" } };

    // Add validation for 100 rows
    for (let i = 2; i <= 1000; i++) {
      // Validation Username
      sheet.getCell(`A${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [userRef] // Reference to hidden user list
      };

      // Validation Date
      sheet.getCell(`B${i}`).dataValidation = {
        type: 'date',
        allowBlank: true,
        operator: 'greaterThan',
        formulae: [new Date("2020-01-01")],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Invalid Date',
        error: 'Mohon gunakan format tanggal yang valid (YYYY-MM-DD)'
      };
      // number format for Date column
      sheet.getCell(`B${i}`).numFmt = 'yyyy-mm-dd';

      // Validation Shift
      sheet.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [shiftRef] // Reference to hidden shift list
      };
    }

    res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.attachment("Template_Jadwal_Shift.xlsx");

  await workbook.xlsx.write(res);
  res.end();
});
