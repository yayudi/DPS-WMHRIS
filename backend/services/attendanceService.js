import * as attendanceRepository from '../repositories/attendanceRepository.js';

/**
 * Service for Attendance Logic.
 * Orchestrates data fetching and formatting.
 */

/**
 * Get attendance history with formatted response.
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} filter - Optional search filter
 * @returns {Promise<Object>} Formatted logs and stats
 */
export const getHistory = async (startDate, endDate, filter = null) => {
  // 1. Fetch Logs
  const rawLogs = await attendanceRepository.findLogsByDateRange(startDate, endDate, filter);

  // 2. Format Logs
  const formattedLogs = rawLogs.map(log => {
    let status = 'Hadir';
    if (log.lateness_minutes > 0) status = 'Terlambat';
    // Note: 'Sakit', 'Alpha' logic depends on how they are stored.
    // For now, if no check_in/check_out but log exists, it might be leave/absent.
    // Assuming database structure stores these states or we infer them.
    // If check_in is null but date exists in logs, it might be a holiday or leave entry if we had that data.
    // For this iteration, we keep it simple based on available columns.

    let duration = '-';
    if (log.check_in && log.check_out) {
      const start = new Date(`1970-01-01T${log.check_in}Z`);
      const end = new Date(`1970-01-01T${log.check_out}Z`);
      const diffMs = end - start;
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffMins = Math.floor((diffMs % 3600000) / 60000);
      duration = `${diffHrs}h ${diffMins}m`;
    }

    return {
      id: log.id,
      user: log.nickname || log.username,
      date: log.date, // already valid date string or object
      timeIn: log.check_in ? log.check_in.slice(0, 5) : '-',
      timeOut: log.check_out ? log.check_out.slice(0, 5) : '-',
      status: status,
      duration: duration
    };
  });

  // 3. Fetch Stats (Optional, could be calculated from logs but efficient to ask DB)
  // For now, let's calculate simplistic stats from the fetched logs to reduce DB calls if dataset is small
  // or use the repository method if we want full aggregates.

  // Using repository for aggregated stats is cleaner for big data
  // const stats = await attendanceRepository.getStatsByDateRange(startDate, endDate);

  return {
    logs: formattedLogs,
    // stats: stats
  };
};
