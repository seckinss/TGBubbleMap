import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

// Import local modules
import { fetchMapData } from './utils/api.js';
import { generateBubbleMap } from './utils/visualization.js';

// Define interfaces
interface BubbleMapQueryParams {
  token?: string;
  chain?: string;
  width?: string;
  height?: string;
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Error handler middleware
interface ApiError extends Error {
  status?: number;
}

const errorHandler = (err: ApiError, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || 500;
  
  console.error(`Error [${statusCode}]: ${err.message}`);
  
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Server error' : err.message,
    message: statusCode === 500 ? 'An unexpected error occurred' : err.message
  });
};

// Welcome route
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Bubblemaps Image Generator API',
    endpoints: {
      bubbleMap: '/bubble-map?token=TOKEN_ADDRESS&chain=CHAIN',
      supportedChains: ['eth', 'bsc', 'ftm', 'avax', 'cro', 'arbi', 'poly', 'base', 'sol', 'sonic']
    }
  });
});

// Health check endpoint for Docker
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Get bubble map image for a token
app.get('/bubble-map', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, chain, width, height } = req.query as BubbleMapQueryParams;
    
    if (!token || !chain) {
      const error: ApiError = new Error('Missing parameters: Both token address and chain are required');
      error.status = 400;
      throw error;
    }
    
    // Validate chain parameter
    const supportedChains = ['eth', 'bsc', 'ftm', 'avax', 'cro', 'arbi', 'poly', 'base', 'sol', 'sonic'];
    if (!supportedChains.includes(chain.toLowerCase())) {
      const error: ApiError = new Error(`Invalid chain: Supported chains are: ${supportedChains.join(', ')}`);
      error.status = 400;
      throw error;
    }
    
    // Fetch map data from Bubblemaps API
    const mapData = await fetchMapData(token, chain);
    
    // Generate bubble map image
    const imageBuffer = await generateBubbleMap(
      mapData, 
      width ? parseInt(width) : undefined,
      height ? parseInt(height) : undefined
    );
    
    // Send the image as response
    res.set('Content-Type', 'image/png');
    res.send(imageBuffer);
  } catch (error) {
    // Check for specific error cases
    if (error instanceof Error && error.message.includes('Map not computed')) {
      const apiError: ApiError = error;
      apiError.status = 401;
      return next(apiError);
    }
    
    next(error);
  }
});

// Apply error handler
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
