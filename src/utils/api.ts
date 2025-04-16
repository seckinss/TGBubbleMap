import axios from 'axios';
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'https://api-legacy.bubblemaps.io';

/**
 * Interface for API response error
 */
interface ApiError extends Error {
  response?: {
    status: number;
    data: any;
  };
}

/**
 * Fetches map data for a specific token from the Bubblemaps legacy API
 * @param {string} token - The token address to analyze
 * @param {string} chain - The blockchain network (eth, bsc, ftm, avax, cro, arbi, poly, base, sol, sonic)
 * @returns {Promise<Object>} - The map data
 */
async function fetchMapData(token: string, chain: string): Promise<any> {
  try {
    const response = await axios.get(`${API_BASE_URL}/map-data`, {
      params: {
        token,
        chain
      }
    });
    return response.data;
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.response && apiError.response.status === 401) {
      throw new Error('Map not computed. API key required for on-demand computation.');
    }
    throw error;
  }
}

export { fetchMapData }; 