// frontend/src/api/helpers/exportStats.js
import apiClient from '@/core/infrastructure/http.client';

/**
 * Request a background export job for stock movement statistics.
 * @param {{ startDate: string, endDate: string, searchQuery?: string, status?: string, movement?: string, building?: string[] }} filters
 * @returns {Promise<{ success: boolean, message: string, jobId?: number }>}
 */
export const requestStatisticExport = async (filters) => {
  const response = await apiClient.post('/statistics/stock-movements/export', {
    startDate: filters.startDate,
    endDate: filters.endDate,
    searchQuery: filters.searchQuery || null,
    status: filters.status || 'all',
    movement: filters.movement || 'all',
    building: filters.building || [],
    categoryId: filters.categoryId || 'all',
    exportName: filters.exportName || '',
  });
  return response.data;
};

export const requestStockTimelineExport = async (filters) => {
  const response = await apiClient.post('/statistics/stock-timeline/export', {
    startDate: filters.startDate,
    endDate: filters.endDate,
    searchQuery: filters.searchQuery || null,
    status: filters.status || 'all',
    movement: filters.movement || 'all',
    building: filters.building || [],
    exportName: filters.exportName || '',
  });
  return response.data;
};
