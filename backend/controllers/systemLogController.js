import * as logRepo from "../repositories/systemLogRepository.js";

export const getSystemLogs = async (req, res) => {
  try {
    const { page, limit, search, action, targetType, userId, startDate, endDate } = req.query;

    const result = await logRepo.getLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search,
      action,
      targetType,
      userId,
      startDate,
      endDate
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error fetching system logs:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil log sistem." });
  }
};
