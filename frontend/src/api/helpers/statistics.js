// frontend/src/api/helpers/statistics.js
import api from '../axios.js';

/**
 * Fetch stock movement statistics
 * @param {Object} filters Filter params (startDate, endDate, searchQuery, status, movement, building)
 * @returns {Promise<Array>} Array of statistic data
 */
export const getStockMovementStatistics = async (filters) => {
  try {
    const { data } = await api.get('/statistics/stock-movements', {
      params: filters
    });
    return data;
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw error;
  }
};


/**
 * Fetch inventory value statistics
 * @param {Object} filters Filter params
 * @returns {Promise<Array>} Array of statistic data
 */
export const getInventoryValueStatistics = async (filters) => {
  try {
    const { data } = await api.get('/statistics/inventory-value', {
      params: filters
    });
    return data;
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw error;
  }
};

/**
 * Fetch product stock timeline for investigation
 * @param {string} productId
 * @param {number} page
 * @param {number} limit
 * @param {string[]} buildings
 */
export const getProductStockTimeline = async (productId, page, limit, buildings = []) => {
  try {
    const params = { page, limit };
    if (buildings && buildings.length > 0) {
      params.building = buildings.join(',');
    }
    const { data } = await api.get(`/products/${productId}/stock-timeline`, {
      params
    });
    return data;
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw error;
  }
};

/**
 * Fetch location analysis statistics
 * @param {Object} filters Filter params
 * @returns {Promise<Array>} Array of statistic data
 */
export const fetchLocationAnalysis = async (filters) => {
  try {
    const { data } = await api.get('/statistics/location-analysis', {
      params: filters
    });
    return data;
  } catch (error) {
    console.error(error)
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw error;
  }
};

/**
 * Fetch stock breakdown per building for a specific product
 * @param {number} productId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>} Array of building breakdown data
 */
export const getStockBuildingBreakdown = async (productId, startDate, endDate) => {
  try {
    const { data } = await api.get(`/statistics/stock-movements/${productId}/breakdown`, {
      params: { startDate, endDate }
    });
    return data;
  } catch (error) {
    console.error(error)
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw error;
  }
};
