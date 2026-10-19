import * as shiftRepository from '../repositories/shiftRepository.js';
import * as scheduleRepository from '../repositories/scheduleRepository.js';
import * as attendanceRepository from '../repositories/attendanceRepository.js'; // Ensure this is imported if used (e.g. at step 3)
import { signals } from "./firebaseSignalService.js";
import { timeToMinutes } from "../utils/dateUtils.js";

// ... existing code ...

/**
 * @param {any} username
 * @param {any} date
 * @param {any} payload
 * @returns {Promise<any>}
 */
export const updateAttendance = async (username, date, payload) => {
  // 1. Prepare Data
  const { timeIn, timeOut, status, notes } = payload;

  const check_in = timeIn || null;
  const check_out = timeOut || null;
  const finalNotes = notes || null;

  // 2. Determine Effective Shift
  let shift;
  const userId = await shiftRepository.getUserIdByUsername(username);

  // Check for Schedule Override
  if (userId) {
    const schedule = await scheduleRepository.getScheduleByDate(userId, date);
    if (schedule) {
      shift = schedule; // The schedule object already contains joined shift details (start_time, end_time, flexible_minutes)
    }
  }

  // Fallback to Default User Shift if no schedule
  if (!shift) {
    shift = await shiftRepository.getUserShift(username);
  }

  // Default values
  const shiftStartMin = timeToMinutes(shift.start_time); // e.g. 08:00 = 480
  const shiftEndMin = timeToMinutes(shift.end_time);     // e.g. 16:00 = 960
  const tolerance = shift.flexible_minutes || 0;

  // 3. Recalculate Logic
  let lateness_minutes = 0;
  let overtime_minutes = 0;

  if (check_in) {
    const inMinutes = timeToMinutes(check_in);

    // Dynamic Lateness
    // Late if CheckIn > Shift Start + Tolerance
    if (inMinutes > (shiftStartMin + tolerance)) {
      lateness_minutes = inMinutes - shiftStartMin; // Calculate from Start Time (not incl tolerance)
    }
  }

  if (check_out) {
    const outMinutes = timeToMinutes(check_out);

    // Dynamic Overtime
    // Overtime if CheckOut > Shift End
    if (outMinutes > shiftEndMin) {
      overtime_minutes = outMinutes - shiftEndMin;
    }
  }

  // 3. Call Repo
  const result = await attendanceRepository.upsertLog(username, date, {
    check_in,
    check_out,
    notes: finalNotes,
    lateness_minutes,
    overtime_minutes,
    status // Pass status explicitly
  });

  signals.refreshAttendance();

  return result;
};
