// backend/controllers/statsController.js
import { getKpiSummary } from "../services/statsService.js";

export const fetchKpiSummary = async (req, res) => {
  try {
    const kpiData = await getKpiSummary();
    res.status(200).json({ success: true, data: kpiData });
  } catch (error) {
    console.error("Error di statsController fetchKpiSummary:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data ringkasan KPI.",
    });
  }
};
